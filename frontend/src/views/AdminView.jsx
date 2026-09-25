import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { refreshRemoteConfig } from '../config/chains';
import {
  getAdminConfig,
  getDebugUserOps,
  getObservabilitySummary,
  pollIndexer,
  pollReceipts,
  updateAdminChain,
  updateAdminChainContracts,
  updateSharedContracts,
  upsertAdminChain,
} from '../utils/backendApi';
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
  RefreshCw,
  Database,
  Gauge,
} from 'lucide-react';
import { MultisigABI, ERC20PaymasterABI, StakeableABI } from '../utils/abis';

const CONTRACT_FIELDS = ['paymaster', 'usdcToken', 'priceFeed', 'multisigProxy'];
const SHARED_CONTRACT_FIELDS = [
  'ENTRY_POINT',
  'FACTORY',
  'K1_VALIDATOR',
  'SESSION_KEY_VALIDATOR',
  'SOCIAL_RECOVERY_VALIDATOR',
  'WEBAUTHN_VALIDATOR',
];

const emptyChainForm = {
  chainId: '',
  name: '',
  rpcUrl: '',
  bundlerUrl: '',
  explorerUrl: '',
  explorerApiUrl: '',
  explorerApiChainId: '',
  nativeSymbol: 'ETH',
  nativeName: 'Ether',
  nativeDecimals: '18',
  minPriorityFeeWei: '0',
  minFeeWei: '0',
  isTestnet: true,
  isActive: false,
  viewOnly: true,
};

const toChainForm = (chain) => ({
  chainId: String(chain?.chainId || ''),
  name: chain?.name || '',
  rpcUrl: chain?.rpcUrl || '',
  bundlerUrl: chain?.bundlerUrl || '',
  explorerUrl: chain?.explorerUrl || '',
  explorerApiUrl: chain?.explorerApiUrl || '',
  explorerApiChainId: chain?.explorerApiChainId ? String(chain.explorerApiChainId) : '',
  nativeSymbol: chain?.nativeCurrency?.symbol || 'ETH',
  nativeName: chain?.nativeCurrency?.name || 'Ether',
  nativeDecimals: String(chain?.nativeCurrency?.decimals || 18),
  minPriorityFeeWei: chain?.minPriorityFeeWei || '0',
  minFeeWei: chain?.minFeeWei || '0',
  isTestnet: chain?.isTestnet ?? true,
  isActive: chain?.isActive ?? false,
  viewOnly: chain?.viewOnly ?? true,
});

const toContractForm = (contracts = {}, fields = CONTRACT_FIELDS) => (
  Object.fromEntries(fields.map((key) => [key, contracts[key] || '']))
);

export default function AdminView() {
  const { eoaAddress, env } = useAppContext();

  const [adminMode, setAdminMode] = useState('protocol');
  const [opsSummary, setOpsSummary] = useState(null);
  const [debugOps, setDebugOps] = useState([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [adminConfig, setAdminConfig] = useState(null);
  const [selectedChainId, setSelectedChainId] = useState('');
  const [chainForm, setChainForm] = useState(emptyChainForm);
  const [contractForm, setContractForm] = useState(toContractForm());
  const [sharedForm, setSharedForm] = useState({});
  const [configLoading, setConfigLoading] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');

  const [targetType, setTargetType] = useState('paymaster');
  const [action, setAction] = useState('unlockStake');

  const [targetAddress, setTargetAddress] = useState(env.PAYMASTER || "");
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

  const MULTISIG_ADDRESS = env.MULTISIG_PROXY;

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
      setTargetAddress(env.PAYMASTER || "");
      setAction('unlockStake');
    } else {
      setTargetAddress(env.FACTORY || "");
      setAction('unlockStake');
    }
  }, [targetType, env.PAYMASTER, env.FACTORY]);

  useEffect(() => {
    if (eoaAddress && targetAddress && MULTISIG_ADDRESS) {
      calculateTxHash();
    }
  }, [action, eoaAddress, targetAddress, MULTISIG_ADDRESS, newImplAddress, nativeValue, tokenAddress, tokenAmount, recipientAddress]);

  const loadOperations = async () => {
    setOpsLoading(true);
    try {
      const [summary, dropped] = await Promise.all([
        getObservabilitySummary(),
        getDebugUserOps({ status: 'dropped', limit: 5 }),
      ]);
      setOpsSummary(summary);
      setDebugOps(Array.isArray(dropped) ? dropped : []);
    } catch (error) {
      setAdminNotice(`Operations load failed: ${error.message}`);
    } finally {
      setOpsLoading(false);
    }
  };

  const loadAdminConfig = async () => {
    setConfigLoading(true);
    try {
      const config = await getAdminConfig();
      setAdminConfig(config);
      const firstChain = config?.chains?.[0] || null;
      if (firstChain && !selectedChainId) {
        setSelectedChainId(String(firstChain.chainId));
        setChainForm(toChainForm(firstChain));
        setContractForm(toContractForm(firstChain.contracts));
      }
      setSharedForm(toContractForm(config?.sharedContracts || {}, SHARED_CONTRACT_FIELDS));
    } catch (error) {
      setAdminNotice(`Config load failed: ${error.message}`);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (adminMode === 'operations') {
      void loadOperations();
    }
    if (adminMode === 'chains') {
      void loadAdminConfig();
    }
  }, [adminMode]);

  const selectChain = (chainId) => {
    setSelectedChainId(chainId);
    if (chainId === 'new') {
      setChainForm(emptyChainForm);
      setContractForm(toContractForm());
      return;
    }
    const chain = adminConfig?.chains?.find((item) => String(item.chainId) === String(chainId));
    setChainForm(toChainForm(chain));
    setContractForm(toContractForm(chain?.contracts));
  };

  const buildChainPayload = () => ({
    chainId: Number(chainForm.chainId),
    name: chainForm.name.trim(),
    rpcUrl: chainForm.rpcUrl.trim(),
    bundlerUrl: chainForm.bundlerUrl.trim(),
    explorerUrl: chainForm.explorerUrl.trim(),
    explorerApiUrl: chainForm.explorerApiUrl.trim() || undefined,
    explorerApiChainId: chainForm.explorerApiChainId ? Number(chainForm.explorerApiChainId) : undefined,
    nativeSymbol: chainForm.nativeSymbol.trim(),
    nativeName: chainForm.nativeName.trim(),
    nativeDecimals: Number(chainForm.nativeDecimals || 18),
    minPriorityFeeWei: chainForm.minPriorityFeeWei || '0',
    minFeeWei: chainForm.minFeeWei || '0',
    isTestnet: Boolean(chainForm.isTestnet),
    isActive: Boolean(chainForm.isActive),
    viewOnly: Boolean(chainForm.viewOnly),
  });

  const refreshConfigAfterSave = async (message) => {
    await refreshRemoteConfig();
    window.dispatchEvent(new CustomEvent('aa-config-updated'));
    await loadAdminConfig();
    setAdminNotice(message);
  };

  const saveChain = async () => {
    try {
      const payload = buildChainPayload();
      if (!payload.chainId || !payload.name) {
        setAdminNotice('Chain ID and name are required.');
        return;
      }
      if (selectedChainId === 'new') {
        await upsertAdminChain({ ...payload, contracts: contractForm });
      } else {
        await updateAdminChain(payload.chainId, payload);
      }
      await refreshConfigAfterSave('Chain config saved and app config cache invalidated.');
    } catch (error) {
      setAdminNotice(`Chain save failed: ${error.message}`);
    }
  };

  const saveChainContracts = async () => {
    try {
      if (!chainForm.chainId) {
        setAdminNotice('Select or create a chain first.');
        return;
      }
      await updateAdminChainContracts(Number(chainForm.chainId), contractForm);
      await refreshConfigAfterSave('Chain contract addresses saved.');
    } catch (error) {
      setAdminNotice(`Contract save failed: ${error.message}`);
    }
  };

  const saveShared = async () => {
    try {
      await updateSharedContracts(sharedForm);
      await refreshConfigAfterSave('Shared contract addresses saved.');
    } catch (error) {
      setAdminNotice(`Shared contract save failed: ${error.message}`);
    }
  };

  const runReceiptPoll = async () => {
    try {
      const result = await pollReceipts();
      setAdminNotice(`Receipt poll scanned ${result?.scanned || 0} pending op(s).`);
      await loadOperations();
    } catch (error) {
      setAdminNotice(`Receipt poll failed: ${error.message}`);
    }
  };

  const runIndexerPoll = async () => {
    try {
      const result = await pollIndexer();
      setAdminNotice(`Indexer scanned ${result?.scannedChains || 0} chain(s), indexed ${result?.indexedOps || 0} op(s).`);
      await loadOperations();
    } catch (error) {
      setAdminNotice(`Indexer poll failed: ${error.message}`);
    }
  };

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

  return (
    <div className="admin-shell animate-fade-in">
      <section className="admin-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="admin-section-title" style={{ margin: 0 }}>
          <span><Shield size={18} /></span>
          <h3>Admin Workspace</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['protocol', 'Protocol Ops'],
            ['operations', 'Operations'],
            ['chains', 'Chain Config'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`admin-btn ${adminMode === id ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => setAdminMode(id)}
              style={{ padding: '0.65rem 0.9rem' }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {adminNotice && (
        <div className="admin-status-banner">
          <BadgeCheck size={17} />
          <span>{adminNotice}</span>
        </div>
      )}

      {adminMode === 'protocol' && !MULTISIG_ADDRESS && (
        <div className="admin-card admin-empty-state">
          <Shield size={48} />
          <h2>Multisig Not Configured</h2>
          <p>Please add the multisig proxy address to the active chain config.</p>
        </div>
      )}

      {adminMode === 'protocol' && MULTISIG_ADDRESS && (
        <>
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
          <span>This transaction will be executed on {env.CHAIN_CONFIG?.name || "the selected"} testnet.</span>
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
        </>
      )}

      {adminMode === 'operations' && (
        <section className="admin-dashboard-grid">
          <div className="admin-card admin-payload-card">
            <div className="admin-section-title">
              <span><Gauge size={18} /></span>
              <h3>Platform Metrics</h3>
            </div>
            <div className="admin-actions" style={{ marginBottom: 16 }}>
              <button className="admin-btn admin-btn-secondary" onClick={loadOperations} disabled={opsLoading}>
                <RefreshCw size={18} /> {opsLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button className="admin-btn admin-btn-secondary" onClick={runReceiptPoll}>
                <Clock size={18} /> Poll Receipts
              </button>
              <button className="admin-btn admin-btn-secondary" onClick={runIndexerPoll}>
                <Database size={18} /> Run Indexer
              </button>
            </div>
            <div className="admin-detail-list">
              <div className="admin-detail-row">
                <span>Total UserOps</span>
                <strong>{opsSummary?.userOps?.total ?? '-'}</strong>
              </div>
              <div className="admin-detail-row">
                <span>Average Confirmation</span>
                <strong>{opsSummary?.userOps?.averageConfirmationSeconds ? `${opsSummary.userOps.averageConfirmationSeconds}s` : '-'}</strong>
              </div>
              <div className="admin-code-block">
                <div><span>UserOps By Status</span></div>
                <code>{JSON.stringify(opsSummary?.userOps?.byStatus || {}, null, 2)}</code>
              </div>
              <div className="admin-code-block">
                <div><span>Agents By Status</span></div>
                <code>{JSON.stringify(opsSummary?.agents?.byStatus || {}, null, 2)}</code>
              </div>
            </div>
          </div>

          <div className="admin-card admin-steps-card">
            <div className="admin-section-title">
              <span><Database size={18} /></span>
              <h3>Indexer State</h3>
            </div>
            <div className="admin-detail-list">
              {(opsSummary?.chains || []).map((chain) => (
                <div className="admin-code-block" key={chain.chainId}>
                  <div>
                    <span>{chain.name} ({chain.chainId})</span>
                  </div>
                  <code>
                    {`active: ${chain.isActive}\nlastIndexedBlock: ${chain.lastIndexedBlock || '-'}\nlastSyncAt: ${chain.lastSyncAt || '-'}\nlastSyncError: ${chain.lastSyncError || '-'}`}
                  </code>
                </div>
              ))}
              {debugOps.length > 0 && (
                <div className="admin-code-block">
                  <div><span>Recent Dropped Ops</span></div>
                  <code>{debugOps.map((op) => `${op.userOpHash} | ${op.label || 'UserOp'} | ${op.updatedAt}`).join('\n')}</code>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {adminMode === 'chains' && (
        <section className="admin-dashboard-grid">
          <div className="admin-card admin-payload-card">
            <div className="admin-section-title">
              <span><Database size={18} /></span>
              <h3>Chain Registry</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field admin-select-field">
                <span>Chain</span>
                <select value={selectedChainId} onChange={(e) => selectChain(e.target.value)}>
                  {(adminConfig?.chains || []).map((chain) => (
                    <option key={chain.chainId} value={chain.chainId}>
                      {chain.name} ({chain.chainId}) {chain.isActive ? 'active' : 'inactive'}
                    </option>
                  ))}
                  <option value="new">+ New chain</option>
                </select>
                <ChevronDown size={18} />
              </label>
              {[
                ['chainId', 'Chain ID'],
                ['name', 'Name'],
                ['rpcUrl', 'RPC URL'],
                ['bundlerUrl', 'Bundler URL'],
                ['explorerUrl', 'Explorer URL'],
                ['explorerApiUrl', 'Explorer API URL'],
                ['explorerApiChainId', 'Explorer API Chain ID'],
                ['nativeSymbol', 'Native Symbol'],
                ['nativeName', 'Native Name'],
                ['nativeDecimals', 'Native Decimals'],
                ['minPriorityFeeWei', 'Min Priority Fee Wei'],
                ['minFeeWei', 'Min Fee Wei'],
              ].map(([key, label]) => (
                <label className="admin-field" key={key}>
                  <span>{label}</span>
                  <input
                    type={key.toLowerCase().includes('url') ? 'url' : 'text'}
                    value={chainForm[key]}
                    onChange={(e) => setChainForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    disabled={key === 'chainId' && selectedChainId !== 'new'}
                  />
                </label>
              ))}
              {[
                ['isActive', 'Active'],
                ['viewOnly', 'View Only'],
                ['isTestnet', 'Testnet'],
              ].map(([key, label]) => (
                <label className="admin-field admin-select-field" key={key}>
                  <span>{label}</span>
                  <select
                    value={String(chainForm[key])}
                    onChange={(e) => setChainForm((prev) => ({ ...prev, [key]: e.target.value === 'true' }))}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                  <ChevronDown size={18} />
                </label>
              ))}
            </div>
            <div className="admin-actions" style={{ marginTop: 16 }}>
              <button className="admin-btn admin-btn-primary" onClick={saveChain} disabled={configLoading}>
                <CheckCircle size={18} /> Save Chain
              </button>
              <button className="admin-btn admin-btn-secondary" onClick={loadAdminConfig}>
                <RefreshCw size={18} /> Reload
              </button>
            </div>
          </div>

          <div className="admin-card admin-steps-card">
            <div className="admin-section-title">
              <span><Settings size={18} /></span>
              <h3>Contract Addresses</h3>
            </div>
            <div className="admin-detail-list">
              {CONTRACT_FIELDS.map((key) => (
                <label className="admin-field" key={key}>
                  <span>{key}</span>
                  <input
                    type="text"
                    value={contractForm[key] || ''}
                    onChange={(e) => setContractForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0x..."
                  />
                </label>
              ))}
              <button className="admin-btn admin-btn-primary" onClick={saveChainContracts}>
                <CheckCircle size={18} /> Save Chain Contracts
              </button>

              <div className="admin-section-title" style={{ marginTop: 24 }}>
                <span><Shield size={18} /></span>
                <h3>Shared Contracts</h3>
              </div>
              {SHARED_CONTRACT_FIELDS.map((key) => (
                <label className="admin-field" key={key}>
                  <span>{key}</span>
                  <input
                    type="text"
                    value={sharedForm[key] || ''}
                    onChange={(e) => setSharedForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0x..."
                  />
                </label>
              ))}
              <button className="admin-btn admin-btn-secondary" onClick={saveShared}>
                <CheckCircle size={18} /> Save Shared Contracts
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
