import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { IEntryPointABI, SmartAccountABI, ERC20_ABI } from "../utils/abis";
import { useToast } from "./ToastContext";
import { getUserOpReceipt } from "../utils/bundler";

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

  const nativeToken = Number(chainId) === 80002 ? "POL" : "ETH";
  const isAmoy = Number(chainId) === 80002;

  const getUsdcAddress = () => isAmoy ? "0xA0C3907b1fc323AdB95dA27e08e289deaE87BD8C" : import.meta.env.VITE_USDC_TOKEN;


  const [eoaETHBalance, setEoaETHBalance] = useState("0");
  const [eoaUSDCBalance, setEoaUSDCBalance] = useState("0");
  const [eoaEURCBalance, setEoaEURCBalance] = useState("0");

  const [smartAccountAddress, setSmartAccountAddress] = useState(() => {
    try {
      return localStorage.getItem('smartAccountAddress') || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (smartAccountAddress) {
      localStorage.setItem('smartAccountAddress', smartAccountAddress);
    } else {
      localStorage.removeItem('smartAccountAddress');
    }
  }, [smartAccountAddress]);

  const [saETHBalance, setSaETHBalance] = useState("0");
  const [saUSDCBalance, setSaUSDCBalance] = useState("0");
  const [saEURCBalance, setSaEURCBalance] = useState("0");
  const [saEntryPointDeposit, setSaEntryPointDeposit] = useState("0");
  const [saOwner, setSaOwner] = useState("");

  const [paymasterAddress, setPaymasterAddress] = useState(import.meta.env.VITE_PAYMASTER || "");
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

  const fetchRecentOps = async (saAddress = smartAccountAddress, _provider = provider) => {
    if (!saAddress || !_provider) return;
    setLoadingOps(true);
    try {
      const entryPointAddress = import.meta.env.VITE_ENTRY_POINT;
      const epContract = new ethers.Contract(entryPointAddress, IEntryPointABI, _provider);
      const filter = epContract.filters.UserOperationEvent(null, saAddress);

      const blockNum = await _provider.getBlockNumber();
      const events = await epContract.queryFilter(filter, Math.max(0, blockNum - 1000), "latest");

      const last10 = events.slice(-10).reverse();
      const formattedOps = await Promise.all(last10.map(async (e) => {
        let timestamp = null;
        try {
          const block = await _provider.getBlock(e.blockNumber);
          if (block) timestamp = block.timestamp * 1000;
        } catch (err) {
          console.warn("Could not fetch block timestamp", err);
        }
        return {
          userOpHash: e.args[0],
          status: e.args[4] ? 'Success' : 'Reverted',
          txHash: e.transactionHash,
          timestamp
        };
      }));
      setRecentOps(formattedOps);
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

  // Call this right after sendUserOperation() — instantly unblocks the view
  const trackOp = useCallback((opHash, label = 'UserOperation') => {
    setTrackedOps(prev => [
      { opHash, label, submittedAt: Date.now(), status: 'pending' },
      ...prev.filter(op => op.opHash !== opHash)
    ]);
    addPendingUserOp(opHash);
  }, []);

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

  const expectedChainId = parseInt(import.meta.env.VITE_CHAIN_ID || 11155111);

  // Re-fetch EOA balances
  const loadEOABalances = async (address, _provider = provider) => {
    if (!address || !_provider) return;
    try {
      const ethBal = await _provider.getBalance(address);
      setEoaETHBalance(ethBal.toString());

      const usdcAddress = getUsdcAddress();
      if (usdcAddress) {
        const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);
        const usdcBal = await usdc.balanceOf(address);
        setEoaUSDCBalance(usdcBal.toString());
      }

      if (!isAmoy) {
        const eurcAddress = "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4";
        const eurc = new ethers.Contract(eurcAddress, ERC20_ABI, _provider);
        const eurcBal = await eurc.balanceOf(address);
        setEoaEURCBalance(eurcBal.toString());
      } else {
        setEoaEURCBalance("0");
      }
    } catch (err) {
      console.error("Error loading EOA balances:", err);
    }
  };

  // Re-fetch Smart Account details
  const loadSmartAccountDetails = async (saAddress, _provider = provider) => {
    if (!saAddress || !_provider) return;
    try {
      // Check if it exists
      const code = await _provider.getCode(saAddress);
      if (code === "0x") {
        setSaETHBalance("0");
        setSaUSDCBalance("0");
        setSaEntryPointDeposit("0");
        setSaOwner("");
        return;
      }

      const balance = await _provider.getBalance(saAddress);
      setSaETHBalance(balance.toString());

      const usdcAddress = getUsdcAddress();
      if (usdcAddress) {
        const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);
        const usdcBal = await usdc.balanceOf(saAddress);
        setSaUSDCBalance(usdcBal.toString());
      }

      if (!isAmoy) {
        const eurcAddress = "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4";
        const eurc = new ethers.Contract(eurcAddress, ERC20_ABI, _provider);
        const eurcBal = await eurc.balanceOf(saAddress);
        setSaEURCBalance(eurcBal.toString());
      } else {
        setSaEURCBalance("0");
      }

      const entryPoint = new ethers.Contract(import.meta.env.VITE_ENTRY_POINT, IEntryPointABI, _provider);
      const deposit = await entryPoint.balanceOf(saAddress);
      setSaEntryPointDeposit(deposit.toString());

      const saContract = new ethers.Contract(saAddress, SmartAccountABI, _provider);
      try {
        const owner = await saContract.owner();
        setSaOwner(owner);
      } catch (e) {
        setSaOwner("Unknown (Error fetching owner)");
      }
    } catch (err) {
      console.error("Error loading SA details:", err);
    }
  };

  // Re-fetch Paymaster details
  const loadPaymasterDetails = async (pmAddress, _provider = provider) => {
    if (!pmAddress || !_provider) return;
    try {
      const entryPoint = new ethers.Contract(import.meta.env.VITE_ENTRY_POINT, IEntryPointABI, _provider);
      const usdcAddress = getUsdcAddress();
      const tokenContract = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);

      try {
        const info = await entryPoint.getDepositInfo(pmAddress);
        setPmDeposit(info.deposit.toString());
        setPmStake(info.stake.toString());
        setPmUnstakeDelay(info.unstakeDelaySec.toString());
      } catch (e) {
        const deposit = await entryPoint.balanceOf(pmAddress);
        setPmDeposit(deposit.toString());
        setPmStake("0");
        setPmUnstakeDelay("0");
      }

      const ethBal = await _provider.getBalance(pmAddress);
      setPmEthBalance(ethBal.toString());

      try {
        const sym = await tokenContract.symbol();
        const dec = await tokenContract.decimals();
        setPmTokenSymbol(sym);
        setPmTokenDecimals(Number(dec));
        const tokenBal = await tokenContract.balanceOf(pmAddress);
        setPmUsdcBalance(ethers.formatUnits(tokenBal, Number(dec)));
      } catch (e) {
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
  const refreshAllData = async () => {
    // Run in parallel for speed
    const refreshes = [];
    if (eoaAddress) refreshes.push(loadEOABalances(eoaAddress, provider));
    if (smartAccountAddress) {
      refreshes.push(loadSmartAccountDetails(smartAccountAddress, provider));
      refreshes.push(fetchRecentOps(smartAccountAddress, provider));
    }
    if (paymasterAddress) refreshes.push(loadPaymasterDetails(paymasterAddress, provider));

    await Promise.all(refreshes);
    setRefreshTrigger(prev => prev + 1);
  };

  // Fetch details immediately whenever provider or addresses change
  useEffect(() => {
    if (provider) {
      refreshAllData();
    }
  }, [provider, eoaAddress, smartAccountAddress, paymasterAddress]);

  // Ref for latest refreshAllData to avoid stale closures in the block listener
  const refreshAllDataRef = useRef(refreshAllData);
  useEffect(() => {
    refreshAllDataRef.current = refreshAllData;
  }, [refreshAllData]);

  // Real-time block listener
  useEffect(() => {
    if (!provider) return;

    console.log("[AppContext] Subscribing to block events for real-time updates");
    const onBlock = () => {
      console.log("[AppContext] New block mined, refreshing all balances...");
      if (refreshAllDataRef.current) {
        refreshAllDataRef.current();
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
    const POLL_INTERVAL_MS = 3000;
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

    const interval = setInterval(async () => {
      const pendingOps = trackedOpsRef.current.filter(op => op.status === 'pending');
      if (pendingOps.length === 0) return;

      for (const op of pendingOps) {
        const age = Date.now() - op.submittedAt;

        // Timeout: drop after 5 minutes
        if (age > TIMEOUT_MS) {
          setTrackedOps(prev => prev.map(o =>
            o.opHash === op.opHash ? { ...o, status: 'dropped' } : o
          ));
          toast.error(`"${op.label}" may have been dropped by the bundler. Check JiffyScan with hash: ${op.opHash.slice(0, 10)}...`);
          continue;
        }

        try {
          // Step 1: Try the bundler's eth_getUserOperationReceipt API first (fast path)
          const result = await getUserOpReceipt(op.opHash);
          if (result && result.receipt) {
            markConfirmed(op.opHash, result.receipt.transactionHash, op.label);
            continue;
          }

          // Step 2: Bundler returned null — fall back to querying EntryPoint logs on-chain
          // This handles the case where the bundler has pruned the op from its mempool
          // but the tx was actually mined on-chain.
          const _provider = providerRef.current;
          const entryPointAddress = import.meta.env.VITE_ENTRY_POINT;
          if (_provider && entryPointAddress) {
            try {
              const epContract = new ethers.Contract(entryPointAddress, IEntryPointABI, _provider);
              const currentBlock = await _provider.getBlockNumber();
              // Search last 500 blocks (approx 100 min on Sepolia)
              const fromBlock = Math.max(0, currentBlock - 500);
              const filter = epContract.filters.UserOperationEvent(op.opHash);
              const events = await epContract.queryFilter(filter, fromBlock, 'latest');
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

      setProvider(browserProvider);
      setChainId(Number(network.chainId));

      const _signer = await browserProvider.getSigner();
      setSigner(_signer);

      const address = await _signer.getAddress();
      setEoaAddress(address);

      await loadEOABalances(address, browserProvider);

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
    const hexChainId = "0x" + targetChainId.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          if (targetChainId === 11155111) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: hexChainId,
                chainName: "Sepolia Test Network",
                nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://sepolia.infura.io/v3/a710f8c2379a44fda67fce69cf197679"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              }],
            });
          } else if (targetChainId === 80002) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: hexChainId,
                chainName: "Polygon Amoy Testnet",
                nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
                rpcUrls: ["https://rpc-amoy.polygon.technology/"],
                blockExplorerUrls: ["https://amoy.polygonscan.com/"],
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

            setProvider(browserProvider);
            setChainId(Number(network.chainId));

            const _signer = await browserProvider.getSigner();
            setSigner(_signer);

            const address = await _signer.getAddress();
            setEoaAddress(address);

            await loadEOABalances(address, browserProvider);
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
      loadSmartAccountDetails(smartAccountAddress);
      fetchRecentOps(smartAccountAddress);
    }
  }, [smartAccountAddress]);

  const value = {
    isTxLoading, txLoadingMessage, setGlobalLoading,
    currentView, setCurrentView,
    setupStep, setSetupStep,
    provider, signer, eoaAddress, chainId, expectedChainId, nativeToken, isAmoy,
    eoaETHBalance, eoaUSDCBalance, eoaEURCBalance,
    smartAccountAddress, setSmartAccountAddress,
    saETHBalance, saUSDCBalance, saEURCBalance, saEntryPointDeposit, saOwner,
    paymasterAddress, setPaymasterAddress,
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals,
    connectWallet, disconnect, isConnecting, switchNetwork,
    loadEOABalances, loadSmartAccountDetails, loadPaymasterDetails, refreshAllData, refreshTrigger,
    pendingUserOps, addPendingUserOp,
    trackedOps, trackOp,
    recentOps, loadingOps, fetchRecentOps,
    env: {
      ENTRY_POINT: import.meta.env.VITE_ENTRY_POINT,
      FACTORY: import.meta.env.VITE_FACTORY,
      USDC_TOKEN: getUsdcAddress(),
      PRICE_FEED: isAmoy ? "0x2A60D7e36FC5FDa6e97aE2C7d054656382f730D7" : import.meta.env.VITE_PRICE_FEED,
      SKANDHA_RPC_URL: isAmoy 
        ? import.meta.env.VITE_SKANDHA_RPC_URL.replace("11155111", "80002") 
        : import.meta.env.VITE_SKANDHA_RPC_URL,
      VERIFYING_SIGNER: import.meta.env.VITE_VERIFYING_SIGNER,
    }
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
