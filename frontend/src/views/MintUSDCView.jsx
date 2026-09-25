import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Coins, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react';
import { getExplorerTxUrl } from '../config/chains';
import { buildAndSendAccountOp, encodeERC7579Batch } from '../utils/helpers';

const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) public",
  "function decimals() public view returns (uint8)"
];

export default function MintUSDCView() {
  const {
    signer,
    provider,
    smartAccountAddress,
    chainId,
    env
  } = useAppContext();

  const [amount, setAmount] = useState('100');
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState(null);

  // Aave Deposit State
  const [aaveAmount, setAaveAmount] = useState('100');
  const [isAavePending, setIsAavePending] = useState(false);
  const [aaveStatus, setAaveStatus] = useState('');

  const { success, error, info } = useToast();

  const usdcAddress = env.VITE_USDC_TOKEN || '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E';
  const AAVE_POOL = '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4';

  if (!smartAccountAddress) {
    return (
      <div className="glass-card max-w-2xl mx-auto text-center py-10 border border-red-500/30">
        <h3 className="text-danger mb-2">Smart Account Required</h3>
        <p className="text-muted text-sm">You must set up or connect a Smart Account before minting USDC.</p>
      </div>
    );
  }

  const handleMint = async () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      error('Please enter a valid amount');
      return;
    }
    
    if (parseFloat(amount) > 10000) {
      error('You can only mint up to 10,000 USDC at a time');
      return;
    }

    try {
      setPending(true);
      setTxHash(null);

      const usdcContract = new ethers.Contract(usdcAddress, MOCK_USDC_ABI, signer);
      const amountToMint = ethers.parseUnits(amount.toString(), 6);

      const tx = await usdcContract.mint(smartAccountAddress, amountToMint);
      info('Mint transaction submitted');
      
      const receipt = await tx.wait();
      
      setTxHash(receipt.hash);
      success(`Successfully minted ${amount} USDC`);
      setAmount('');
    } catch (err) {
      console.error(err);
      error(err.reason || err.message || 'Failed to mint USDC');
    } finally {
      setPending(false);
    }
  };

  const handleAaveDeposit = async () => {
    if (!aaveAmount || isNaN(aaveAmount) || parseFloat(aaveAmount) <= 0) {
      error('Please enter a valid amount');
      return;
    }

    try {
      setIsAavePending(true);
      setAaveStatus('Preparing batched UserOp...');
      
      const amountToDeposit = ethers.parseUnits(aaveAmount.toString(), 6);
      
      const mockToken = new ethers.Contract(usdcAddress, ['function approve(address spender, uint256 amount) external returns (bool)'], signer);
      const pool = new ethers.Contract(AAVE_POOL, ['function deposit(uint256 _amount) external'], signer);
      
      const approveData = mockToken.interface.encodeFunctionData('approve', [AAVE_POOL, amountToDeposit]);
      const depositData = pool.interface.encodeFunctionData('deposit', [amountToDeposit]);
      
      const callData = encodeERC7579Batch(
        [usdcAddress, AAVE_POOL],
        [0n, 0n],
        [approveData, depositData]
      );
      
      setAaveStatus('Sign UserOp in Wallet...');
      
      const opHash = await buildAndSendAccountOp(
        signer, 
        provider, 
        smartAccountAddress, 
        callData, 
        env.ENTRY_POINT, 
        env.K1_VALIDATOR, 
        chainId
      );
      
      setAaveStatus('✅ Success! UserOp submitted.');
      success(`Batched UserOp submitted: ${opHash.slice(0, 10)}...`);
      setAaveAmount('');
      setTimeout(() => setAaveStatus(''), 5000);
    } catch (err) {
      console.error(err);
      const msg = err.reason || err.message || 'Failed Batched Aave Deposit';
      setAaveStatus('❌ Error: ' + msg.slice(0, 50));
      error(msg);
    } finally {
      setIsAavePending(false);
    }
  };

  const resetForm = () => {
    setTxHash(null);
    setAmount('100');
  };

  if (txHash) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-[1720px] mx-auto h-[calc(100vh-140px)] overflow-y-auto pb-10 px-4 pt-6">
        <div className="glass-card w-full max-w-5xl mx-auto text-center py-12 animate-fade-in flex flex-col items-center gap-4 border-stone-300 shadow-md">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success mb-2">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-gradient">Mint Successful</h2>
        <p className="text-muted text-sm max-w-sm">
          Successfully minted USDC to your smart account.
        </p>
        
        <div className="flex gap-4 mt-6">
          <button className="btn btn-secondary" onClick={resetForm}>
            <RotateCcw size={18} /> Mint More
          </button>
          
          <a
            href={getExplorerTxUrl(chainId, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            View on Explorer <ExternalLink size={18} />
          </a>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1720px] mx-auto h-[calc(100vh-140px)] overflow-y-auto pb-10 px-4 pt-6">
      <div className="glass-card w-full mx-auto flex flex-col gap-5 border-stone-300 shadow-md">
        <h2 className="flex items-center gap-2 text-gradient"><Coins size={24} /> Mint Mock USDC</h2>

        <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-col gap-2">
          <span className="text-sm text-muted">Minting to Smart Account</span>
          <span className="font-mono text-sm break-all text-white/90">{smartAccountAddress}</span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted">Amount (Max 10,000)</label>
          <input
            type="number"
            className="input-field"
            placeholder="100"
            value={amount}
            max="10000"
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <button
          className={`btn btn-primary mt-4 ${(pending || !amount) ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={pending || !amount}
          onClick={handleMint}
        >
          {pending ? (
            <div className="flex items-center justify-center gap-2">
              <div className="loader" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>
              Minting...
            </div>
          ) : (
            'Mint USDC to Smart Account'
          )}
        </button>
      </div>

      {/* Aave 3-Step Deposit Card */}
      <div className="glass-card w-full mx-auto flex flex-col gap-5 mt-4">
        <h2 className="flex items-center gap-2 text-gradient"><Coins size={24} /> Testnet Aave Deposit (UserOp)</h2>

        <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-col gap-2">
          <span className="text-sm text-muted">Submits a single Batched UserOperation from your Smart Account. This atomic transaction will Approve the Aave Pool and Supply USDC simultaneously, requiring only one signature.</span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted">Amount to Supply</label>
          <input
            type="number"
            className="input-field"
            placeholder="100"
            value={aaveAmount}
            onChange={(e) => setAaveAmount(e.target.value)}
          />
        </div>

        {aaveStatus && (
          <div className={`text-sm mt-2 ${aaveStatus.startsWith('❌') ? 'text-red-400' : 'text-green-400'}`}>
            {aaveStatus}
          </div>
        )}

        <button
          className={`btn btn-secondary mt-2 ${(isAavePending || !aaveAmount) ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isAavePending || !aaveAmount}
          onClick={handleAaveDeposit}
        >
          {isAavePending ? (
            <div className="flex items-center justify-center gap-2">
              <div className="loader" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#000' }}></div>
              Processing 3 Txs...
            </div>
          ) : (
            'Mint & Supply to Aave'
          )}
        </button>
      </div>
    </div>
  );
}
