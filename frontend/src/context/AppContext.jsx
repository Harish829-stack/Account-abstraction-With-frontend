import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import { IEntryPointABI, SmartAccountABI, ERC20_ABI } from "../utils/abis";
import { useToast } from "./ToastContext";

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [currentView, setCurrentView] = useState("home"); // home | profile | setup | send | paymaster
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const toast = useToast();
  const [eoaAddress, setEoaAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('app-theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  const [eoaETHBalance, setEoaETHBalance] = useState("0");
  const [eoaUSDCBalance, setEoaUSDCBalance] = useState("0");

  const [smartAccountAddress, setSmartAccountAddress] = useState(null);
  const [saETHBalance, setSaETHBalance] = useState("0");
  const [saUSDCBalance, setSaUSDCBalance] = useState("0");
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

  const [pendingUserOps, setPendingUserOps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pendingUserOps')) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('pendingUserOps', JSON.stringify(pendingUserOps));
  }, [pendingUserOps]);

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

      const usdcAddress = import.meta.env.VITE_USDC_TOKEN;
      if (usdcAddress) {
        const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);
        const usdcBal = await usdc.balanceOf(address);
        setEoaUSDCBalance(usdcBal.toString());
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

      const usdcAddress = import.meta.env.VITE_USDC_TOKEN_OFFICIAL;
      if (usdcAddress) {
        const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, _provider);
        const usdcBal = await usdc.balanceOf(saAddress);
        setSaUSDCBalance(usdcBal.toString());
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
      const usdcAddress = import.meta.env.VITE_USDC_TOKEN;
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
    if (smartAccountAddress) refreshes.push(loadSmartAccountDetails(smartAccountAddress, provider));
    if (paymasterAddress) refreshes.push(loadPaymasterDetails(paymasterAddress, provider));
    
    await Promise.all(refreshes);
  };

  // Real-time block listener
  useEffect(() => {
    if (!provider) return;
    
    console.log("[AppContext] Subscribing to block events for real-time updates");
    const onBlock = () => {
      console.log("[AppContext] New block mined, refreshing all balances...");
      refreshAllData();
    };

    provider.on("block", onBlock);
    return () => {
      provider.off("block", onBlock);
    };
  }, [provider, eoaAddress, smartAccountAddress, paymasterAddress]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask (window.ethereum) is required!");
      return;
    }
    setIsConnecting(true);
    try {
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

      if (currentView === "home") {
        setCurrentView("profile");
      }
    } catch (error) {
       if (error.code === 4001) {
          toast.error("Transaction rejected by user.");
       } else {
          console.error(error);
          toast.error(error.message || "Failed to connect wallet.");
       }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setEoaAddress(null);
    setSmartAccountAddress(null);
    setCurrentView("home");
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

  // Sync smart account dynamically whenever it changes
  useEffect(() => {
     if (smartAccountAddress) {
       loadSmartAccountDetails(smartAccountAddress);
     }
  }, [smartAccountAddress]);

  const value = {
    theme, setTheme,
    currentView, setCurrentView,
    provider, signer, eoaAddress, chainId, expectedChainId,
    eoaETHBalance, eoaUSDCBalance,
    smartAccountAddress, setSmartAccountAddress,
    saETHBalance, saUSDCBalance, saEntryPointDeposit, saOwner,
    paymasterAddress, setPaymasterAddress, 
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals,
    connectWallet, disconnect, isConnecting,
    loadEOABalances, loadSmartAccountDetails, loadPaymasterDetails, refreshAllData,
    pendingUserOps, addPendingUserOp,
    env: {
       ENTRY_POINT: import.meta.env.VITE_ENTRY_POINT,
       FACTORY: import.meta.env.VITE_FACTORY,
       USDC_TOKEN: import.meta.env.VITE_USDC_TOKEN,
       PRICE_FEED: import.meta.env.VITE_PRICE_FEED,
       SKANDHA_RPC_URL: import.meta.env.VITE_SKANDHA_RPC_URL,
       VERIFYING_SIGNER: import.meta.env.VITE_VERIFYING_SIGNER,
    }
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
