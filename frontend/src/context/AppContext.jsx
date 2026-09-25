import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { IEntryPointABI, SmartAccountABI, ERC20_ABI, K1ValidatorABI, MultisigABI } from "../utils/abis";
import { useToast } from "./ToastContext";
import { getUserOpReceipt } from "../utils/bundler";
import { getInstalledModules, predictSmartAccountAddress } from "../utils/helpers";
import {
  getAccountHistory,
  getUserOperation,
  saveUserOperation,
  upsertSmartAccount,
} from "../utils/backendApi";
import {
  getChainConfig,
  getChainContracts,
  getDefaultChainId,
  getNativeCurrency,
  getReadRpcUrl,
  SHARED_CONTRACTS,
} from "../config/chains";

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [currentView, setCurrentView] = useState(() => {
    try {
      return localStorage.getItem('currentView') || 'home';
    } catch {
      return 'home';
    }
  });

  const [setupStep, setSetupStep] = useState(1);

  useEffect(() => {
    localStorage.setItem('currentView', currentView);
  }, [currentView]);

  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const toast = useToast();
  const [eoaAddress, setEoaAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  useEffect(() => {
    const handleConfigUpdated = () => setRefreshTrigger((value) => value + 1);
    window.addEventListener("aa-config-updated", handleConfigUpdated);
    return () => window.removeEventListener("aa-config-updated", handleConfigUpdated);
  }, []);

  const expectedChainId = getDefaultChainId();
  const currentChain = getChainConfig(chainId) || getChainConfig(expectedChainId);
  const currentContracts = getChainContracts(currentChain?.chainId);
  const nativeToken = getNativeCurrency(currentChain?.chainId).symbol;
  const isAmoy = currentChain?.name === "Polygon Amoy";

  const getUsdcAddress = (targetChainId = currentChain?.chainId) => getChainContracts(targetChainId).usdcToken || "";


  const [eoaETHBalance, setEoaETHBalance] = useState("0");
  const [eoaUSDCBalance, setEoaUSDCBalance] = useState("0");

  const [smartAccountAddress, setSmartAccountAddress] = useState(null);

  const [smartAccountStatus, setSmartAccountStatus] = useState("predicted");
  const [isSmartAccountDeployed, setIsSmartAccountDeployed] = useState(false);

  // Financial Agent Chat State (Persists across tabs, resets on reload)
  const [financeAgentMessages, setFinanceAgentMessages] = useState([
    {
      id: 1,
      role: 'agent',
      content: `Hello! I'm your Portfolio Intelligence Agent.\n\nI can help you monitor your portfolio, check market prices, analyze DeFi yields, and prepare transactions.\n\nHow can I assist you today?`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      toolCalls: []
    }
  ]);
  const [financeAgentHistory, setFinanceAgentHistory] = useState([]);

  // Auto-predict smart account when eoaAddress and provider are ready
  useEffect(() => {
    let active = true;
    const predictAndCheck = async () => {
      if (!eoaAddress || !provider) {
        if (active) {
          setSmartAccountAddress(null);
          setSmartAccountStatus("predicted");
          setIsSmartAccountDeployed(false);
        }
        return;
      }
      try {
        const factoryAddress = SHARED_CONTRACTS.FACTORY;
        const predicted = await predictSmartAccountAddress(eoaAddress, provider, factoryAddress);
        if (!active || !predicted) return;

        setSmartAccountAddress(predicted);

        // Check if deployed
        const code = await provider.getCode(predicted);
        if (code !== "0x") {
          setIsSmartAccountDeployed(true);
          setSmartAccountStatus("deployed");
        } else {
          setIsSmartAccountDeployed(false);
          setSmartAccountStatus("predicted");
        }
      } catch (err) {
        console.error("Failed to predict and check smart account:", err);
      }
    };
    predictAndCheck();
    return () => { active = false; };
  }, [eoaAddress, provider]);

  const [saETHBalance, setSaETHBalance] = useState("0");
  const [saUSDCBalance, setSaUSDCBalance] = useState("0");
  const [saEntryPointDeposit, setSaEntryPointDeposit] = useState("0");
  const [saOwner, setSaOwner] = useState("");
  const [isMultisigOwner, setIsMultisigOwner] = useState(false);

  // Module installation status — fetched once via getValidatorsPaginated on connect
  // { hasSessionKey, hasSocialRecovery, hasWebAuthn, rawValidators }
  const [installedModules, setInstalledModules] = useState({
    hasSessionKey: false,
    hasSocialRecovery: false,
    hasWebAuthn: false,
    rawValidators: [],
  });
  const [loadingModules, setLoadingModules] = useState(false);
  const installedModulesRef = useRef(installedModules);
  useEffect(() => {
    installedModulesRef.current = installedModules;
  }, [installedModules]);
  const moduleRefreshInFlightRef = useRef(null);
  const lastModuleRefreshAtRef = useRef(0);
  const refreshAllInFlightRef = useRef(null);
  const refreshLightInFlightRef = useRef(null);
  const lastRefreshAllAtRef = useRef(0);
  const tokenMetaCacheRef = useRef(new Map());

  const [paymasterAddress, setPaymasterAddress] = useState(getChainContracts(getDefaultChainId()).paymaster || "");
  useEffect(() => {
    setPaymasterAddress(currentContracts.paymaster || "");
  }, [currentContracts.paymaster]);
  const [pmETHBalance, setPmEthBalance] = useState("0");
  const [pmUSDCBalance, setPmUsdcBalance] = useState("0"); // PM Token balance
  const [pmDeposit, setPmDeposit] = useState("0");
  const [pmStake, setPmStake] = useState("0");
  const [pmUnstakeDelay, setPmUnstakeDelay] = useState("0");
  const [pmTokenSymbol, setPmTokenSymbol] = useState("USDC");
  const [pmTokenDecimals, setPmTokenDecimals] = useState(6);

  const [isConnecting, setIsConnecting] = useState(false);
  
  const [isTxLoading, setIsTxLoading] = useState(false);
  const [txLoadingMessage, setTxLoadingMessage] = useState("");

  const setGlobalLoading = useCallback((isLoading, message = "") => {
    setIsTxLoading(isLoading);
    setTxLoadingMessage(message);
  }, []);

  const [pendingUserOps, setPendingUserOps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pendingUserOps')) || [];
    } catch {
      return [];
    }
  });

  const [recentOps, setRecentOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);

  const createReadProvider = async (browserProvider, targetChainId) => {
    const readRpcUrl = getReadRpcUrl(targetChainId);
    const chain = getChainConfig(targetChainId);
    if (!readRpcUrl || !chain) return browserProvider;

    const rpcProvider = new ethers.JsonRpcProvider(
      readRpcUrl,
      { chainId: chain.chainId, name: chain.name },
      { staticNetwork: true, batchMaxCount: 1 }
    );

    try {
      await Promise.race([
        rpcProvider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Read RPC health check timed out")), 2500))
      ]);
      return rpcProvider;
    } catch (error) {
      console.warn("Configured read RPC unavailable; falling back to wallet provider:", error);
      rpcProvider.destroy?.();
      return browserProvider;
    }
  };

  const getTokenMetadata = async (tokenAddress, _provider, fallback = { symbol: "USDC", decimals: 6 }) => {
    if (!tokenAddress || !_provider) return fallback;
    const key = `${chainIdRef.current || chainId || "unknown"}:${tokenAddress.toLowerCase()}`;
    const cached = tokenMetaCacheRef.current.get(key);
    if (cached) return cached;

    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, _provider);
      const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
      ]);
      const meta = { symbol, decimals: Number(decimals) };
      tokenMetaCacheRef.current.set(key, meta);
      return meta;
    } catch (error) {
      console.warn("Failed to fetch token metadata, using fallback:", error);
      tokenMetaCacheRef.current.set(key, fallback);
      return fallback;
    }
  };

  const fetchRecentOps = async (saAddress = smartAccountAddress, _provider = provider) => {
    if (!saAddress || !_provider) return;
    setLoadingOps(true);
    try {
      const network = await _provider.getNetwork();
      const opChain = getChainConfig(Number(network.chainId)) || currentChain;
      try {
        const backendOps = await getAccountHistory({
          smartAccountAddress: saAddress,
          chainId: opChain.chainId,
          limit: 10,
        });
        if (Array.isArray(backendOps) && backendOps.length > 0) {
          setRecentOps(backendOps);
          return;
        }
      } catch (backendErr) {
        console.warn("Backend history unavailable, falling back to explorer:", backendErr);
      }

      const entryPointAddress = SHARED_CONTRACTS.ENTRY_POINT;
      if (!opChain?.explorerApiUrl || !entryPointAddress) return;
      
      // Etherscan V2 API unifies all chains under a single API endpoint and key!
      const apiKey = import.meta.env.VITE_ETHERSCAN_API_KEY;
      const baseUrl = opChain.explorerApiUrl;
      
      const topic0 = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f"; // UserOperationEvent
      const paddedSender = ethers.zeroPadValue(saAddress, 32);
      
      // Remove offset so it fetches all logs, as sort=desc is ignored by some explorer API endpoints
      const url = `${baseUrl}?chainid=${opChain.explorerApiChainId || opChain.chainId}&module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=${entryPointAddress}&topic0=${topic0}&topic0_2_opr=and&topic2=${paddedSender}&apikey=${apiKey}`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      let formattedOps = [];
      
      if (data.status === "1" && Array.isArray(data.result)) {
        // Successfully fetched from Explorer API
        // Reverse the array to guarantee newest is on top (descending order)
        formattedOps = data.result.reverse().map(log => {
          // data structure of UserOperationEvent: 
          // topic1 = userOpHash, topic2 = sender, topic3 = paymaster
          // data = [nonce, success, actualGasCost, actualGasUsed]
          const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "bool", "uint256", "uint256"], log.data);
          return {
            userOpHash: log.topics[1],
            status: decodedData[1] ? 'Success' : 'Reverted',
            txHash: log.transactionHash,
            timestamp: log.timeStamp ? parseInt(log.timeStamp, 16) * 1000 : null
          };
        });
      } else {
        // Fallback to strict tiny RPC range if API fails or API key is missing
        console.warn("Explorer API failed or no logs, falling back to strict RPC getLogs", data);
        const epContract = new ethers.Contract(entryPointAddress, IEntryPointABI, _provider);
        const filter = epContract.filters.UserOperationEvent(null, saAddress);
        const blockNum = await _provider.getBlockNumber();
        const events = await epContract.queryFilter(filter, Math.max(0, blockNum - 100), blockNum);
        const last10 = events.slice(-10).reverse();
        
        formattedOps = await Promise.all(last10.map(async (e) => {
          return {
            userOpHash: e.args[0],
            status: e.args[4] ? 'Success' : 'Reverted',
            txHash: e.transactionHash,
            timestamp: null // Skip block timestamp fetch to save RPC calls
          };
        }));
      }
      
      setRecentOps(formattedOps.slice(0, 10));
    } catch (err) {
      console.error("Error fetching UserOps:", err);
    } finally {
      setLoadingOps(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('pendingUserOps', JSON.stringify(pendingUserOps));
  }, [pendingUserOps]);

  // --- Global Background Transaction Tracker ---
  // Each entry: { opHash, label, submittedAt, status: 'pending' | 'confirmed' | 'dropped' }
  const [trackedOps, setTrackedOps] = useState(() => {
    try {
      const saved = localStorage.getItem('trackedOps');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const trackedOpsRef = useRef(trackedOps);
  useEffect(() => { 
    trackedOpsRef.current = trackedOps; 
    localStorage.setItem('trackedOps', JSON.stringify(trackedOps));
  }, [trackedOps]);

  const eoaAddressRef = useRef(null);
  useEffect(() => { eoaAddressRef.current = eoaAddress; }, [eoaAddress]);
  const smartAccountAddressRef = useRef(null);
  useEffect(() => { smartAccountAddressRef.current = smartAccountAddress; }, [smartAccountAddress]);
  const chainIdRef = useRef(null);
  useEffect(() => { chainIdRef.current = chainId; }, [chainId]);

  // Call this right after sendUserOperation() — instantly unblocks the view
  const trackOp = useCallback((opHash, label = 'UserOperation', metadata = {}) => {
    setTrackedOps(prev => [
      { opHash, label, submittedAt: Date.now(), status: 'pending' },
      ...prev.filter(op => op.opHash !== opHash)
    ]);
    addPendingUserOp(opHash);
    void persistUserOperation(opHash, label, metadata);
  }, []);

  const persistUserOperation = async (opHash, label, metadata = {}) => {
    const accountAddress = metadata.smartAccountAddress || smartAccountAddressRef.current;
    const owner = metadata.ownerEoa || eoaAddressRef.current;
    const opChainId = metadata.chainId || chainIdRef.current;
    if (!opHash || !accountAddress || !owner || !opChainId) return;

    try {
      await saveUserOperation({
        hash: opHash,
        smartAccountAddress: accountAddress,
        ownerEoa: owner,
        chainId: opChainId,
        label,
        calldata: metadata.calldata || "0x",
        status: metadata.status || "pending",
        txHash: metadata.txHash,
        receipt: metadata.receipt,
      });
    } catch (error) {
      console.warn("Failed to persist UserOp:", error);
    }
  };

  const addPendingUserOp = (hash, txHash) => {
    setPendingUserOps(prev => {
      const existingIdx = prev.findIndex(op => (typeof op === 'string' ? op === hash : op.userOpHash === hash));
      if (existingIdx >= 0) {
        // update existing
        const newOps = [...prev];
        newOps[existingIdx] = { userOpHash: hash, txHash: txHash || newOps[existingIdx].txHash };
        return newOps;
      }
      return [{ userOpHash: hash, txHash }, ...prev].slice(0, 10); // Keep last 10 locally sent
    });
  };

  const loadEOABalances = async (address, _provider = provider, { includeOwnership = false } = {}) => {
    if (!address || !_provider) return;
    try {
      const activeChainId = chainIdRef.current || chainId || currentChain?.chainId;
      const contracts = getChainContracts(activeChainId);

      const ethBal = await _provider.getBalance(address);
      setEoaETHBalance(ethBal.toString());

      const usdcAddress = contracts.usdcToken;
      if (usdcAddress) {
        try {
          const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);
          const usdcBal = await usdc.balanceOf(address);
          setEoaUSDCBalance(usdcBal.toString());
        } catch (e) {
          console.warn("Failed to fetch EOA USDC balance:", e);
          setEoaUSDCBalance("0");
        }
      }



      // Check Multisig Ownership
      const multisigProxy = contracts.multisigProxy;
      if (includeOwnership && multisigProxy) {
        try {
          const multisig = new ethers.Contract(multisigProxy, MultisigABI, _provider);
          const owners = await multisig.getOwners();
          const isOwner = owners.some(o => o.toLowerCase() === address.toLowerCase());
          setIsMultisigOwner(isOwner);
        } catch (e) {
          console.warn("Failed to fetch Multisig owners:", e);
          setIsMultisigOwner(false);
        }
      } else if (includeOwnership) {
        setIsMultisigOwner(false);
      }
    } catch (err) {
      console.error("Error loading EOA balances:", err);
    }
  };

  // Re-fetch Smart Account details
  const loadSmartAccountDetails = async (saAddress, _provider = provider, { includeContractDetails = true } = {}) => {
    if (!saAddress || !_provider) return;
    try {
      const activeChainId = chainIdRef.current || chainId || currentChain?.chainId;
      const contracts = getChainContracts(activeChainId);

      const balance = await _provider.getBalance(saAddress);
      setSaETHBalance(balance.toString());

      const usdcAddress = contracts.usdcToken;
      if (usdcAddress) {
        try {
          const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);
          const usdcBal = await usdc.balanceOf(saAddress);
          setSaUSDCBalance(usdcBal.toString());
        } catch (e) {
          console.warn("Failed to fetch SA USDC balance:", e);
          setSaUSDCBalance("0");
        }
      }



      if (!includeContractDetails) return;

      // Check if it exists for contract-specific details
      const code = await _provider.getCode(saAddress);
      if (code === "0x") {
        setIsSmartAccountDeployed(false);
        setSaEntryPointDeposit("0");
        setSaOwner("");
        return;
      }

      setIsSmartAccountDeployed(true);

      const entryPoint = new ethers.Contract(SHARED_CONTRACTS.ENTRY_POINT, IEntryPointABI, _provider);
      const deposit = await entryPoint.balanceOf(saAddress);
      setSaEntryPointDeposit(deposit.toString());

      try {
        const k1Address = SHARED_CONTRACTS.K1_VALIDATOR;
        const k1Validator = new ethers.Contract(k1Address, K1ValidatorABI, _provider);
        const owner = await k1Validator.getOwner(saAddress);
        setSaOwner(owner);
      } catch {
        setSaOwner("Unknown (Error fetching owner)");
      }
    } catch (err) {
      console.error("Error loading SA details:", err);
    }
  };

  /**
   * Fetches installed modules via getValidatorsPaginated and updates installedModules state.
   * Call this once on smart account connect and after any installModule / uninstallModule op.
   */
  const refreshInstalledModules = useCallback(async (saAddress = smartAccountAddress, _provider = provider, _env = null, options = {}) => {
    if (!saAddress || !_provider) return;
    const now = Date.now();
    const cooldownMs = options.force ? 0 : 15000;
    if (moduleRefreshInFlightRef.current) {
      return moduleRefreshInFlightRef.current;
    }
    if (cooldownMs > 0 && now - lastModuleRefreshAtRef.current < cooldownMs) {
      return installedModulesRef.current;
    }
    setLoadingModules(true);

    moduleRefreshInFlightRef.current = (async () => {
      const envConfig = _env || {
        SESSION_KEY_VALIDATOR:     SHARED_CONTRACTS.SESSION_KEY_VALIDATOR,
        SOCIAL_RECOVERY_VALIDATOR: SHARED_CONTRACTS.SOCIAL_RECOVERY_VALIDATOR,
        WEBAUTHN_VALIDATOR:        SHARED_CONTRACTS.WEBAUTHN_VALIDATOR,
      };
      const modules = await getInstalledModules(saAddress, _provider, envConfig);
      setInstalledModules(modules);
      
      // Update smartAccountStatus based on session key validator
      setSmartAccountStatus(prev => {
        if (modules.hasSessionKey) return "agent_ready";
        if (prev === "agent_ready" || prev === "deployed") return "deployed";
        return prev;
      });
      
      lastModuleRefreshAtRef.current = Date.now();
      return modules;
    })();

    try {
      return await moduleRefreshInFlightRef.current;
    } catch (e) {
      console.warn("refreshInstalledModules failed; keeping previous module state:", e);
      lastModuleRefreshAtRef.current = Date.now();
      return installedModulesRef.current;
    } finally {
      moduleRefreshInFlightRef.current = null;
      setLoadingModules(false);
    }
  }, [smartAccountAddress, provider]);

  useEffect(() => {
    const refreshForModuleEvent = (event) => {
      const detail = event.detail || {};
      if (detail.smartAccountAddress && smartAccountAddress && detail.smartAccountAddress.toLowerCase() !== smartAccountAddress.toLowerCase()) {
        return;
      }
      if (detail.chainId && chainId && String(detail.chainId) !== String(chainId)) {
        return;
      }
      void refreshInstalledModules(smartAccountAddress, provider, null, { force: true });
    };

    window.addEventListener("aa-session-key-module-installed", refreshForModuleEvent);
    window.addEventListener("aa-session-key-module-revoked", refreshForModuleEvent);
    return () => {
      window.removeEventListener("aa-session-key-module-installed", refreshForModuleEvent);
      window.removeEventListener("aa-session-key-module-revoked", refreshForModuleEvent);
    };
  }, [smartAccountAddress, chainId, provider, refreshInstalledModules]);

  // Re-fetch Paymaster details
  const loadPaymasterDetails = async (pmAddress, _provider = provider, { includeEntryPointInfo = true } = {}) => {
    if (!pmAddress || !_provider) return;
    try {
      const entryPoint = new ethers.Contract(SHARED_CONTRACTS.ENTRY_POINT, IEntryPointABI, _provider);
      const usdcAddress = getUsdcAddress();
      const tokenContract = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);

      if (includeEntryPointInfo) {
        try {
          const info = await entryPoint.getDepositInfo(pmAddress);
          setPmDeposit(info.deposit.toString());
          setPmStake(info.stake.toString());
          setPmUnstakeDelay(info.unstakeDelaySec.toString());
        } catch {
          const deposit = await entryPoint.balanceOf(pmAddress);
          setPmDeposit(deposit.toString());
          setPmStake("0");
          setPmUnstakeDelay("0");
        }
      }

      const ethBal = await _provider.getBalance(pmAddress);
      setPmEthBalance(ethBal.toString());

      try {
        const meta = await getTokenMetadata(usdcAddress, _provider);
        setPmTokenSymbol(meta.symbol);
        setPmTokenDecimals(meta.decimals);
        const tokenBal = await tokenContract.balanceOf(pmAddress);
        setPmUsdcBalance(ethers.formatUnits(tokenBal, meta.decimals));
      } catch {
        setPmTokenSymbol("USDC");
        setPmTokenDecimals(6);
        const tokenBal = await tokenContract.balanceOf(pmAddress);
        setPmUsdcBalance(ethers.formatUnits(tokenBal, 6));
      }
    } catch (err) {
      console.error("Error loading PM details:", err);
    }
  };

  // Shared refresh for all views
  const refreshLightData = async ({ force = false } = {}) => {
    if (!provider) return;
    const now = Date.now();
    if (refreshLightInFlightRef.current) return refreshLightInFlightRef.current;
    if (!force && now - lastRefreshAllAtRef.current < 30000) return;

    refreshLightInFlightRef.current = (async () => {
      const refreshes = [];
      if (eoaAddress) refreshes.push(loadEOABalances(eoaAddress, provider));
      if (smartAccountAddress) {
        refreshes.push(loadSmartAccountDetails(smartAccountAddress, provider, { includeContractDetails: false }));
      }
      if (paymasterAddress) {
        refreshes.push(loadPaymasterDetails(paymasterAddress, provider, { includeEntryPointInfo: false }));
      }

      await Promise.allSettled(refreshes);
      lastRefreshAllAtRef.current = Date.now();
      setRefreshTrigger(prev => prev + 1);
    })();

    try {
      await refreshLightInFlightRef.current;
    } finally {
      refreshLightInFlightRef.current = null;
    }
  };

  const refreshAllData = async ({ force = false } = {}) => {
    if (!provider) return;
    const now = Date.now();
    if (refreshAllInFlightRef.current) return refreshAllInFlightRef.current;
    if (!force && now - lastRefreshAllAtRef.current < 20000) return;

    refreshAllInFlightRef.current = (async () => {
      const refreshes = [];
      if (eoaAddress) refreshes.push(loadEOABalances(eoaAddress, provider, { includeOwnership: true }));
      if (smartAccountAddress) {
        refreshes.push(loadSmartAccountDetails(smartAccountAddress, provider, { includeContractDetails: true }));
        refreshes.push(fetchRecentOps(smartAccountAddress, provider));
        refreshes.push(refreshInstalledModules(smartAccountAddress, provider, null, { force }));
      }
      if (paymasterAddress) refreshes.push(loadPaymasterDetails(paymasterAddress, provider, { includeEntryPointInfo: true }));

      await Promise.allSettled(refreshes);
      lastRefreshAllAtRef.current = Date.now();
      setRefreshTrigger(prev => prev + 1);
    })();

    try {
      await refreshAllInFlightRef.current;
    } finally {
      refreshAllInFlightRef.current = null;
    }
  };

  // Fetch details immediately whenever provider or addresses change
  useEffect(() => {
    if (provider) {
      refreshAllData({ force: true });
    }
  }, [provider, eoaAddress, smartAccountAddress, paymasterAddress]);

  // Ref for latest refreshLightData to avoid stale closures in the block listener
  const refreshLightDataRef = useRef(refreshLightData);
  useEffect(() => {
    refreshLightDataRef.current = refreshLightData;
  }, [refreshLightData]);

  // Real-time block listener (throttled to avoid RPC spam)
  useEffect(() => {
    if (!provider) return;

    console.log("[AppContext] Subscribing to block events for real-time updates");
    const onBlock = (blockNum) => {
      // Trigger every 2 blocks (~24s) to catch external incoming/outgoing transfers faster
      if (document.visibilityState === "visible" && blockNum % 2 === 0) {
        if (refreshLightDataRef.current) {
          refreshLightDataRef.current();
        }
      }
    };

    provider.on("block", onBlock);
    return () => {
      provider.off("block", onBlock);
    };
  }, [provider]);

  // Global background poller — polls every 3s for all pending tracked ops
  const setCurrentViewRef = useRef(null);
  useEffect(() => { setCurrentViewRef.current = setCurrentView; }, [setCurrentView]);

  // Store refs for provider and entryPoint so the interval (created once) can access latest values
  const providerRef = useRef(null);
  useEffect(() => { providerRef.current = provider; }, [provider]);

  useEffect(() => {
    // Increase poll interval to 12s to prevent 429 Too Many Requests on Infura free tier
    const POLL_INTERVAL_MS = 12000;
    const TIMEOUT_MS = 20 * 60 * 1000; // Backend worker owns final stale marking.

    const markConfirmed = (opHash, txHash, label) => {
      setTrackedOps(prev => prev.map(o =>
        o.opHash === opHash ? { ...o, status: 'confirmed' } : o
      ));
      addPendingUserOp(opHash, txHash);
      toast.withAction(
        `"${label}" confirmed on-chain!`,
        'View in History →',
        () => setCurrentViewRef.current && setCurrentViewRef.current('history')
      );
      refreshAllData();
    };

    const markReverted = (opHash, txHash, label) => {
      setTrackedOps(prev => prev.map(o =>
        o.opHash === opHash ? { ...o, status: 'reverted' } : o
      ));
      addPendingUserOp(opHash, txHash);
      toast.error(`"${label}" reverted on-chain.`);
      refreshAllData();
    };

    const markDropped = (opHash, label) => {
      setTrackedOps(prev => prev.map(o =>
        o.opHash === opHash ? { ...o, status: 'dropped' } : o
      ));
      toast.error(`"${label}" may have been dropped by the bundler. Check JiffyScan with hash: ${opHash.slice(0, 10)}...`);
    };

    const interval = setInterval(async () => {
      const pendingOps = trackedOpsRef.current.filter(op => op.status === 'pending');
      if (pendingOps.length === 0) return;

      for (const op of pendingOps) {
        const age = Date.now() - op.submittedAt;

        try {
          const backendOp = await getUserOperation(op.opHash);
          if (backendOp?.status === "confirmed") {
            markConfirmed(op.opHash, backendOp.txHash, op.label);
            continue;
          }
          if (backendOp?.status === "reverted") {
            markReverted(op.opHash, backendOp.txHash, op.label);
            continue;
          }
          if (backendOp?.status === "dropped") {
            markDropped(op.opHash, op.label);
            continue;
          }
        } catch (backendErr) {
          console.warn(`[Tracker] Backend status unavailable for ${op.opHash}:`, backendErr);
        }

        // Timeout: drop after 5 minutes
        if (age > TIMEOUT_MS) {
          markDropped(op.opHash, op.label);
          continue;
        }

        try {
          // Step 1: Try the bundler's eth_getUserOperationReceipt API first (fast path)
          const result = await getUserOpReceipt(op.opHash, chainIdRef.current);
          if (result && result.receipt) {
            markConfirmed(op.opHash, result.receipt.transactionHash, op.label);
            continue;
          }

          // Step 2: Bundler returned null — fall back to querying EntryPoint logs on-chain
          // This handles the case where the bundler has pruned the op from its mempool
          // but the tx was actually mined on-chain.
          const _provider = providerRef.current;
          const entryPointAddress = SHARED_CONTRACTS.ENTRY_POINT;
          if (_provider && entryPointAddress) {
            try {
              const epContract = new ethers.Contract(entryPointAddress, IEntryPointABI, _provider);
              const currentBlock = await _provider.getBlockNumber();
              // Search last 150 blocks (infura testnet strict limit)
              const fromBlock = Math.max(0, currentBlock - 150);
              const filter = epContract.filters.UserOperationEvent(op.opHash);
              const events = await epContract.queryFilter(filter, fromBlock, currentBlock);
              if (events.length > 0) {
                const txHash = events[0].transactionHash;
                console.log(`[Tracker] Found op ${op.opHash.slice(0, 10)}... via on-chain fallback! TxHash: ${txHash}`);
                markConfirmed(op.opHash, txHash, op.label);
              }
            } catch (onChainErr) {
              console.warn(`[Tracker] On-chain fallback check failed for ${op.opHash.slice(0, 10)}...:`, onChainErr);
            }
          }
        } catch (err) {
          console.warn(`[Tracker] Error polling receipt for ${op.opHash}:`, err);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []); // runs once, uses refs to avoid stale closures

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask (window.ethereum) is required!");
      return;
    }
    setGlobalLoading(true, "Connecting Wallet...");
    setIsConnecting(true);
    try {
      localStorage.removeItem('userDisconnected');
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      const readProvider = await createReadProvider(browserProvider, currentChainId);

      setProvider(readProvider);
      setChainId(currentChainId);

      const _signer = await browserProvider.getSigner();
      setSigner(_signer);

      const address = await _signer.getAddress();
      setEoaAddress(address);

      await loadEOABalances(address, browserProvider, { includeOwnership: true });

      // Stay on home to show the dashboard

    } catch (error) {
      if (error.code === 4001) {
        toast.error("Transaction rejected by user.");
      } else {
        console.error(error);
        toast.error(error.message || "Failed to connect wallet.");
      }
    } finally {
      setIsConnecting(false);
      setGlobalLoading(false);
    }
  };

  const disconnect = () => {
    localStorage.setItem('userDisconnected', 'true');
    setProvider(null);
    setSigner(null);
    setEoaAddress(null);
    setSmartAccountAddress(null);
    setChainId(null);
    setCurrentView("home");
  };

  const switchNetwork = async (targetChainId = expectedChainId) => {
    if (!window.ethereum) {
      toast.error("MetaMask is required to switch networks!");
      return;
    }
    const targetChain = getChainConfig(targetChainId);
    const hexChainId = "0x" + targetChainId.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          if (targetChain?.switchNetwork) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: hexChainId,
                chainName: targetChain.switchNetwork.chainName,
                nativeCurrency: targetChain.nativeCurrency,
                rpcUrls: targetChain.switchNetwork.rpcUrls,
                blockExplorerUrls: targetChain.switchNetwork.blockExplorerUrls,
              }],
            });
          }
        } catch (addError) {
          console.error("Failed to add network:", addError);
          toast.error("Failed to add network to MetaMask.");
        }
      } else {
        console.error("Failed to switch network:", switchError);
        toast.error("Failed to switch network in MetaMask.");
      }
    }
  };


  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          disconnect();
          connectWallet();
        }
      };
      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      }
    }
  }, []);

  // On mount, auto-connect if already authorized in MetaMask
  useEffect(() => {
    const autoConnect = async () => {
      if (localStorage.getItem('userDisconnected') === 'true') return;
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            const browserProvider = new ethers.BrowserProvider(window.ethereum);
            const network = await browserProvider.getNetwork();
            const currentChainId = Number(network.chainId);

            const readProvider = await createReadProvider(browserProvider, currentChainId);

            setProvider(readProvider);
            setChainId(currentChainId);

            const _signer = await browserProvider.getSigner();
            setSigner(_signer);

            const address = await _signer.getAddress();
            setEoaAddress(address);

            await loadEOABalances(address, browserProvider, { includeOwnership: true });
          }
        } catch (e) {
          console.error("Auto-connect failed", e);
        }
      }
    };
    autoConnect();
  }, []);

  // Sync smart account dynamically whenever it changes
  useEffect(() => {
    if (smartAccountAddress) {
      if (eoaAddress && chainId) {
        void upsertSmartAccount({
          address: smartAccountAddress,
          ownerEoa: eoaAddress,
          chainId,
        }).catch((error) => {
          console.warn("Failed to persist smart account:", error);
        });
      }
      loadSmartAccountDetails(smartAccountAddress);
      fetchRecentOps(smartAccountAddress);
      // Fetch installed modules from blockchain once on connect
      refreshInstalledModules(smartAccountAddress, provider);
    }
  }, [smartAccountAddress]);

  const value = {
    isTxLoading, txLoadingMessage, setGlobalLoading,
    currentView, setCurrentView,
    setupStep, setSetupStep,
    provider, signer, eoaAddress, chainId, expectedChainId, nativeToken, isAmoy,
    eoaETHBalance, eoaUSDCBalance,
    smartAccountAddress, setSmartAccountAddress, smartAccountStatus, isSmartAccountDeployed,
    financeAgentMessages, setFinanceAgentMessages, financeAgentHistory, setFinanceAgentHistory,
    saETHBalance, saUSDCBalance, saEntryPointDeposit, saOwner,
    paymasterAddress, setPaymasterAddress,
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals,
    connectWallet, disconnect, isConnecting, switchNetwork,
    loadEOABalances, loadSmartAccountDetails, loadPaymasterDetails, refreshAllData, refreshTrigger,
    // Module installation status (blockchain-sourced, device-agnostic)
    installedModules, loadingModules, refreshInstalledModules,
    isMultisigOwner,
    pendingUserOps, addPendingUserOp,
    trackedOps, trackOp,
    recentOps, loadingOps, fetchRecentOps,
    env: {
      ...SHARED_CONTRACTS,
      ENTRY_POINT: SHARED_CONTRACTS.ENTRY_POINT,
      FACTORY: SHARED_CONTRACTS.FACTORY,
      PAYMASTER: currentContracts.paymaster,
      MULTISIG_PROXY: currentContracts.multisigProxy,
      USDC_TOKEN: getUsdcAddress(),

      PRICE_FEED: currentContracts.priceFeed,
      BUNDLER_URL: currentChain?.bundlerUrl,
      VERIFYING_SIGNER: import.meta.env.VITE_VERIFYING_SIGNER,
      CHAIN_CONFIG: currentChain,
    }
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
