import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import {
  Shield,
  CheckCircle,
  Clock,
  Send,
  Hash,
  Settings,
  Copy,
  ChevronDown,
  WalletCards,
  BadgeCheck,
  Hourglass,
} from 'lucide-react';
import { MultisigABI, ERC20PaymasterABI, StakeableABI } from '../utils/abis';

export default function AdminView() {
  const { eoaAddress, isAmoy } = useAppContext();

  const [targetType, setTargetType] = useState('paymaster');
  const [action, setAction] = useState('unlockStake');

  const [targetAddress, setTargetAddress] = useState(import.meta.env.VITE_PAYMASTER || "");
  const [newImplAddress, setNewImplAddress] = useState("");
  const [nativeValue, setNativeValue] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [currentTxValue, setCurrentTxValue] = useState("0");

  const [txHash, setTxHash] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [nonce, setNonce] = useState('0');
  const [encodedData, setEncodedData] = useState('');
  const [ownersList, setOwnersList] = useState([]);

  const MULTISIG_ADDRESS = import.meta.env.VITE_MULTISIG_PROXY;

  useEffect(() => {
    const fetchOwners = async () => {
      try {
        if (!window.ethereum || !MULTISIG_ADDRESS) return;
        const ethersProvider = new ethers.BrowserProvider(window.ethereum);
        const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, ethersProvider);
        const owners = await multisig.getOwners();
        setOwnersList(owners);
      } catch (error) {
        console.error("Error fetching owners:", error);
      }
    };
    fetchOwners();
  }, [MULTISIG_ADDRESS]);

  useEffect(() => {
    if (targetType === 'paymaster') {
      setTargetAddress(import.meta.env.VITE_PAYMASTER || "");
      setAction('unlockStake');
    } else {
      setTargetAddress(import.meta.env.VITE_FACTORY || "");
      setAction('unlockStake');
    }
  }, [targetType]);

  useEffect(() => {
    if (eoaAddress && targetAddress && MULTISIG_ADDRESS) {
      calculateTxHash();
    }
  }, [action, eoaAddress, targetAddress, MULTISIG_ADDRESS, newImplAddress, nativeValue, tokenAddress, tokenAmount, recipientAddress]);

  const copyToClipboard = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const calculateTxHash = async () => {
    try {
      if (!window.ethereum) return;
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);

      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, ethersProvider);
      const currentNonce = await multisig.nonce();
      setNonce(currentNonce.toString());

      let data = "0x";
      let val = "0";

      const parsedNativeValue = nativeValue && !isNaN(Number(nativeValue)) ? ethers.parseEther(nativeValue).toString() : "0";

      if (targetType === 'paymaster') {
        const pmInterface = new ethers.Interface(ERC20PaymasterABI);
        const recipient = recipientAddress || eoaAddress;

        if (action === 'unlockStake') data = pmInterface.encodeFunctionData("unlockStake");
        if (action === 'withdrawStake') data = pmInterface.encodeFunctionData("withdrawStake", [recipient]);
        if (action === 'addStake') {
          data = pmInterface.encodeFunctionData("addStake", [86400]);
          val = parsedNativeValue;
        }
        if (action === 'deposit') {
          data = pmInterface.encodeFunctionData("deposit");
          val = parsedNativeValue;
        }
        if (action === 'withdrawTo') {
          const amount = tokenAmount ? ethers.parseEther(tokenAmount) : 0n;
          data = pmInterface.encodeFunctionData("withdrawTo", [recipient, amount]);
        }
        if (action === 'withdrawToken') {
          const amount = tokenAmount ? ethers.parseUnits(tokenAmount, 18) : 0n;
          if (tokenAddress && ethers.isAddress(tokenAddress)) {
            data = pmInterface.encodeFunctionData("withdrawToken", [tokenAddress, recipient, amount]);
          }
        }
      } else {
        const factoryInterface = new ethers.Interface(StakeableABI);
        const recipient = recipientAddress || eoaAddress;
        if (action === 'unlockStake') data = factoryInterface.encodeFunctionData("unlockStake");
        if (action === 'withdrawStake') data = factoryInterface.encodeFunctionData("withdrawStake", [recipient]);
        if (action === 'addStake') {
          data = factoryInterface.encodeFunctionData("addStake", [targetAddress, 86400]);
          val = parsedNativeValue;
        }
        if (action === 'setImplementation') {
          if (newImplAddress && ethers.isAddress(newImplAddress)) {
            data = factoryInterface.encodeFunctionData("setImplementation", [newImplAddress]);
          } else {
            data = "0x";
          }
        }
      }

      setEncodedData(data);
      setCurrentTxValue(val);

      const hash = await multisig.getTransactionHash(
        targetAddress,
        val,
        data,
        0,
        currentNonce
      );
      setTxHash(hash);

      const hasApproved = await multisig.approvedHashes(eoaAddress, hash);
      setIsApproved(hasApproved);
    } catch (error) {
      console.error("Error calculating hash:", error);
    }
  };

  const approveHash = async () => {
    try {
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await ethersProvider.getSigner();
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, signer);

      const tx = await multisig.approveHash(txHash);
      await tx.wait();
      setIsApproved(true);
      alert("Hash approved on-chain!");
    } catch (error) {
      console.error("Error approving hash:", error);
      alert("Failed to approve hash.");
    }
  };

  const executeTx = async () => {
    try {
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await ethersProvider.getSigner();
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, signer);

      const owners = await multisig.getOwners();
      const approvedOwners = [];

      for (const owner of owners) {
        const hasApp = await multisig.approvedHashes(owner, txHash);
        if (hasApp) approvedOwners.push(owner);
      }

      const threshold = await multisig.threshold();

      if (approvedOwners.length < threshold) {
        alert(`Not enough approvals. Found ${approvedOwners.length}, but need ${threshold}. Another owner must connect and click 'Approve Hash On-Chain'.`);
        return;
      }

      const signers = approvedOwners.slice(0, Number(threshold)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      let signatures = "0x";
      for (const owner of signers) {
        const r = ethers.zeroPadValue(owner, 32).substring(2);
        const s = "0000000000000000000000000000000000000000000000000000000000000000";
        const v = "02";
        signatures += r + s + v;
      }

      const tx = await multisig.execTransaction(
        targetAddress,
        currentTxValue,
        encodedData,
        0,
        signatures,
        true,
        { value: currentTxValue }
      );
      await tx.wait();
      alert("Transaction Executed Successfully!");
      calculateTxHash();
    } catch (error) {
      console.error("Error executing tx:", error);
      alert("Execution failed. See console for details.");
    }
  };

  if (!MULTISIG_ADDRESS) {
    return (
      <div className="admin-shell">
        <div className="admin-card admin-empty-state">
          <Shield size={48} />
          <h2>Multisig Not Configured</h2>
          <p>Please add <code>VITE_MULTISIG_PROXY</code> to your frontend .env file.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell animate-fade-in">
      <section className="admin-hero admin-card">
        <div className="admin-hero-content">
          <div className="admin-title-row">
            <div className="admin-hero-icon">
              <Shield size={34} />
            </div>
            <div>
              <h2>Admin Control Panel</h2>
              <p>Manage protocol contracts via 2-of-3 Multisig Wallet</p>
            </div>
          </div>
          <div className="admin-address-block">
            <span>Multisig Proxy</span>
            <button type="button" onClick={() => copyToClipboard(MULTISIG_ADDRESS)} title="Copy multisig address">
              <code>{MULTISIG_ADDRESS}</code>
              <Copy size={15} />
            </button>
          </div>

          {ownersList.length > 0 && (
            <div className="admin-owners-list" style={{ marginTop: '1.2rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Shield size={14} /> Authorized Owners
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ownersList.map((owner, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.4rem 0.6rem', borderRadius: '8px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>{index + 1}</span>
                    <code style={{ fontSize: '11px', color: '#1f2937', fontFamily: 'monospace' }}>{owner}</code>
                    {owner.toLowerCase() === eoaAddress?.toLowerCase() && (
                      <span style={{ fontSize: '9px', background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: '12px', fontWeight: 'bold', marginLeft: 'auto' }}>YOU</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="admin-shield-scene" aria-hidden="true">
          <div className="admin-orbit admin-orbit-one"></div>
          <div className="admin-orbit admin-orbit-two"></div>
          <div className="admin-shield-base"></div>
          <div className="admin-shield-plate">
            <Shield size={82} strokeWidth={2.6} />
            <CheckCircle size={34} />
          </div>
        </div>
      </section>

      <section className="admin-card admin-config-card">
        <div className="admin-section-title">
          <span><Settings size={18} /></span>
          <h3>Transaction Configuration</h3>
        </div>
        <div className="admin-form-grid">
          <label className="admin-field admin-select-field">
            <span>Target Contract</span>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="paymaster">ERC20 Paymaster</option>
              <option value="factory">K1 Validator Factory</option>
            </select>
            <ChevronDown size={18} />
          </label>

          <label className="admin-field admin-select-field">
            <span>Action</span>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="unlockStake">Unlock Stake (7 Days Delay)</option>
              <option value="withdrawStake">Withdraw Stake (After Delay)</option>
              {targetType === 'paymaster' && (
                <>
                  <option value="addStake">Add Stake</option>
                  <option value="deposit">Deposit to EntryPoint</option>
                  <option value="withdrawTo">Withdraw Deposit (ETH)</option>
                  <option value="withdrawToken">Withdraw Collected ERC20 Tokens</option>
                </>
              )}
              {targetType === 'factory' && <option value="addStake">Add Stake</option>}
              {targetType === 'factory' && <option value="setImplementation">Set Implementation</option>}
            </select>
            <ChevronDown size={18} />
          </label>

          <label className="admin-field">
            <span>Target Address</span>
            <div className="admin-input-action">
              <input type="text" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} />
              <button type="button" onClick={() => copyToClipboard(targetAddress)} title="Copy target address">
                <Copy size={16} />
              </button>
            </div>
          </label>

          {(action === 'addStake' || action === 'deposit') && (
            <label className="admin-field admin-token-field">
              <span>Native ETH Value (to send)</span>
              <input type="number" value={nativeValue} onChange={(e) => setNativeValue(e.target.value)} placeholder="0.1" />
              <b>ETH</b>
            </label>
          )}

          {(action === 'withdrawTo' || action === 'withdrawToken' || action === 'withdrawStake') && (
            <label className="admin-field">
              <span>Recipient Address</span>
              <input type="text" value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder={eoaAddress || "Defaults to your EOA"} />
            </label>
          )}

          {(action === 'withdrawTo' || action === 'withdrawToken') && (
            <label className="admin-field admin-token-field">
              <span>Amount (18 Decimals)</span>
              <input type="number" value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} placeholder="100.0" />
              <b>TOKEN</b>
            </label>
          )}

          {action === 'withdrawToken' && (
            <label className="admin-field">
              <span>ERC20 Token Address</span>
              <input type="text" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="0x..." />
            </label>
          )}

          {targetType === 'factory' && action === 'setImplementation' && (
            <label className="admin-field">
              <span>New Implementation Address</span>
              <input type="text" value={newImplAddress} onChange={(e) => setNewImplAddress(e.target.value)} placeholder="0x..." />
            </label>
          )}
        </div>

        <div className="admin-status-banner">
          <BadgeCheck size={17} />
          <span>This transaction will be executed on {isAmoy ? "Amoy" : "Sepolia"} testnet.</span>
        </div>
      </section>

      <section className="admin-dashboard-grid">
        <div className="admin-card admin-payload-card">
          <div className="admin-section-title">
            <span><Hash size={18} /></span>
            <h3>Payload Details</h3>
          </div>
          <div className="admin-detail-list">
            <div className="admin-detail-row">
              <span>Target Nonce</span>
              <strong>{nonce}</strong>
            </div>
            <div className="admin-code-block">
              <div>
                <span>Encoded Data</span>
                <button type="button" onClick={() => copyToClipboard(encodedData)} title="Copy encoded data"><Copy size={14} /></button>
              </div>
              <code>{encodedData || "0x"}</code>
            </div>
            <div className="admin-code-block admin-hash-block">
              <div>
                <span>Calculated Tx Hash</span>
                <button type="button" onClick={() => copyToClipboard(txHash)} title="Copy transaction hash"><Copy size={14} /></button>
              </div>
              <code>{txHash || "-"}</code>
            </div>
          </div>
        </div>

        <div className="admin-card admin-steps-card">
          <div className="admin-step-track">
            <div className={`admin-step ${isApproved ? 'is-success' : 'is-pending'}`}>
              <div className="admin-step-icon">{isApproved ? <CheckCircle size={24} /> : <Hourglass size={23} />}</div>
              <div>
                <h4>1. Approve Hash On-Chain</h4>
                <p>{isApproved ? 'Current owner has approved' : 'Waiting for owner approval'}</p>
              </div>
            </div>
            <div className="admin-step-connector"></div>
            <div className="admin-step">
              <div className="admin-step-icon"><Clock size={23} /></div>
              <div>
                <h4>2. Execute Transaction</h4>
                <p>Requires exactly 2 approved owners</p>
              </div>
            </div>
          </div>
          <div className="admin-actions">
            {isApproved ? (
              <div className="admin-approved-pill">
                <CheckCircle size={18} /> You approved this hash
              </div>
            ) : (
              <button onClick={approveHash} disabled={!txHash} className="admin-btn admin-btn-secondary">
                <CheckCircle size={18} /> Approve Hash
              </button>
            )}
            <button onClick={executeTx} disabled={!txHash} className="admin-btn admin-btn-primary">
              <Send size={18} /> Execute Transaction
            </button>
          </div>
          <div className="admin-requirement">
            <WalletCards size={15} />
            <span>Requires exactly 2 approved owners to execute successfully.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
