import React, { useState } from 'react';
import { ChevronRight, ArrowRight, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionHeading } from './Shared';

const deepDiveItems = [
  ["Smart Accounts (ERC-4337)", "ERC-4337 introduces a parallel mempool of UserOperations, letting smart contracts act as wallets with custom validation logic — no protocol changes required.", ["Custom signature schemes (ECDSA, multisig, passkey)", "Batch multiple calls in a single UserOperation", "EntryPoint v0.6 and v0.7 supported", "Counterfactual: deploy only on first use"]],
  ["Modular Accounts (ERC-7579)", "A standard interface for composable smart accounts. Install validators, executors, hooks, and fallback handlers as interchangeable modules at runtime.", ["4 module types: Validator, Executor, Hook, Fallback", "Install / uninstall without changing your address", "Any ERC-7579 module works with any compliant account", "Mix session keys, social recovery, and WebAuthn"]],
  ["Bundler", "Collects UserOps, simulates them against the EntryPoint, and submits valid bundles on-chain. Gas estimation and retry behavior are handled for you.", ["Pre-flight simulation prevents wasted gas", "Concurrent UserOp processing at scale", "Compatible with Stackup, Alchemy, Pimlico alt mempools", "Automatic replacement-by-fee on congestion"]],
  ["Paymaster", "Smart contracts that agree to pay gas on behalf of users. Verifying and ERC-20 Paymasters enforce policy before a UserOp lands.", ["Verifying Paymaster for fully sponsored UX", "ERC-20 Paymaster: USDC, DAI, any token", "Per-wallet daily caps and method-level rules", "No native ETH needed in user wallets"]],
  ["Deterministic Addresses (CREATE3)", "Our CREATE3 factory deploys your smart account at the exact same address on every EVM chain — regardless of bytecode. Unlike CREATE2, the address depends only on the salt, not the initCode hash.", ["Address = f(deployer, salt) only — bytecode-independent", "CREATE3 Factory: CREATE2 deploys a proxy, proxy runs CREATE internally", "Same wallet address on Ethereum, Base, Arbitrum, Polygon, Optimism and more", "Receive assets cross-chain before the wallet is even deployed"]],
  ["Upgradable Accounts", "UUPS proxy pattern separates storage from logic. Upgrade without migrating assets or changing address, with EIP-7702 delegation ready.", ["Logic upgrades with storage and address unchanged", "Guard functions block unauthorized upgrades", "EIP-7702: any EOA temporarily becomes a smart account", "Zero downtime, transparent to end users"]],
];

/* ── Shared primitives ─────────────────────────────────── */
const s = {
  node: (accent) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '8px 14px', borderRadius: 10, gap: 2,
    background: accent ? 'var(--primary)' : 'var(--bg-surface)',
    border: `1.5px solid ${accent ? 'var(--primary)' : 'var(--border-light)'}`,
    boxShadow: accent ? '0 4px 14px rgba(34,197,94,0.22)' : '0 2px 6px rgba(0,0,0,0.05)',
    whiteSpace: 'nowrap',
  }),
  label: (accent) => ({
    fontSize: 12, fontWeight: 700,
    color: accent ? '#fff' : 'var(--text-main)',
    fontFamily: 'var(--font-body)',
  }),
  sub: (accent) => ({
    fontSize: 10, fontWeight: 500,
    color: accent ? 'rgba(255,255,255,0.72)' : 'var(--text-muted)',
  }),
  arrow: { color: 'rgba(34,197,94,0.65)', flexShrink: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  col: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  badge: (variant) => {
    const map = {
      green: { bg: '#f0fdf4', border: 'rgba(34,197,94,0.25)', color: '#15803d' },
      red:   { bg: '#fef2f2', border: 'rgba(239,68,68,0.22)',   color: '#dc2626' },
      amber: { bg: '#fffbeb', border: 'rgba(245,158,11,0.25)',  color: '#b45309' },
      gray:  { bg: 'var(--bg-base)', border: 'var(--border-light)', color: 'var(--text-muted)' },
    };
    const c = map[variant] || map.gray;
    return { padding: '3px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.color, whiteSpace: 'nowrap' };
  },
};

const N = ({ label, sub, accent }) => (
  <div style={s.node(accent)}>
    <span style={s.label(accent)}>{label}</span>
    {sub && <span style={s.sub(accent)}>{sub}</span>}
  </div>
);
const Ra = () => <ArrowRight size={15} style={s.arrow} />;
const Da = () => <ArrowDown size={15} style={s.arrow} />;

/* ── 1. Smart Accounts — ERC-4337 full lifecycle ──────── */
// dApp → sign UserOp → Bundler mempool → submit bundle → EntryPoint
//   → validateUserOp (Account) → executeUserOp (Account) → done
const I1 = () => (
  <div style={{ ...s.col, gap: 10, width: '100%', padding: '4px 0' }}>
    {/* Step 1: User creates UserOp */}
    <div style={s.row}>
      <N label="dApp / User" sub="initiates action" />
      <Ra />
      <N label="UserOperation" sub="calldata + signature" accent />
      <Ra />
      <N label="Alt Mempool" sub="broadcast" />
    </div>
    <Da />
    {/* Step 2: Bundler picks up and submits */}
    <div style={s.row}>
      <N label="Bundler" sub="simulate + batch" />
      <Ra />
      <N label="EntryPoint" sub="on-chain contract" accent />
    </div>
    <Da />
    {/* Step 3: EntryPoint drives account */}
    <div style={s.row}>
      <N label="validateUserOp()" sub="account verifies sig" />
      <Ra />
      <N label="executeUserOp()" sub="calldata runs" />
      <Ra />
      <N label="postOp()" sub="refund gas" />
    </div>
    {/* Labels */}
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={s.badge('green')}>ERC-4337</span>
      <span style={s.badge('gray')}>EntryPoint v0.7</span>
      <span style={s.badge('gray')}>No protocol fork</span>
    </div>
  </div>
);

/* ── 2. Modular Accounts — ERC-7579 hub-and-spokes ──────── */
// Request → Smart Account core → dispatches to correct module type
const I2 = () => (
  <div style={{ ...s.col, gap: 10, width: '100%', padding: '4px 0' }}>
    {/* incoming call */}
    <div style={s.row}>
      <N label="UserOp / call" sub="incoming request" />
      <Ra />
      <N label="Smart Account" sub="ERC-7579 router" accent />
    </div>
    <Da />
    {/* dispatch to modules */}
    <div style={{ ...s.row, gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ ...s.col, gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Validate</span>
        <N label="Validator" sub="ECDSA / passkey" />
      </div>
      <div style={{ width: 1, height: 40, background: 'var(--border-light)' }} />
      <div style={{ ...s.col, gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Execute</span>
        <N label="Executor" sub="batch / DeFi calls" />
      </div>
      <div style={{ width: 1, height: 40, background: 'var(--border-light)' }} />
      <div style={{ ...s.col, gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Guard</span>
        <N label="Hook" sub="pre / post logic" />
      </div>
      <div style={{ width: 1, height: 40, background: 'var(--border-light)' }} />
      <div style={{ ...s.col, gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Route</span>
        <N label="Fallback" sub="custom handler" />
      </div>
    </div>
    <div style={{ padding: '6px 14px', borderRadius: 10, background: 'var(--bg-surface-green)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 11, fontWeight: 650, color: 'var(--primary-hover)', textAlign: 'center' }}>
      Install / uninstall any module — address never changes
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={s.badge('green')}>ERC-7579</span>
      <span style={s.badge('gray')}>Composable</span>
      <span style={s.badge('gray')}>Hot-swap modules</span>
    </div>
  </div>
);

/* ── 3. Bundler — collection → simulation → submission ─── */
const I3 = () => (
  <div style={{ ...s.col, gap: 10, width: '100%', padding: '4px 0' }}>
    {/* mempool */}
    <div style={s.row}>
      <N label="UserOp A" sub="user 1" />
      <N label="UserOp B" sub="user 2" />
      <N label="UserOp C" sub="user 3" />
    </div>
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Alt Mempool</div>
    <Da />
    {/* bundler */}
    <div style={s.row}>
      <N label="Bundler" sub="simulate each op" accent />
      <Ra />
      <div style={{ ...s.col, gap: 4 }}>
        <div style={{ ...s.row, gap: 6 }}>
          <div style={{ padding: '4px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid rgba(34,197,94,0.2)', fontSize: 11, fontWeight: 700, color: '#15803d' }}>✓ Valid → keep</div>
        </div>
        <div style={{ ...s.row, gap: 6 }}>
          <div style={{ padding: '4px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, fontWeight: 700, color: '#dc2626' }}>✗ Invalid → drop</div>
        </div>
      </div>
    </div>
    <Da />
    {/* submission */}
    <div style={s.row}>
      <N label="handleOps()" sub="single tx on-chain" />
      <Ra />
      <N label="EntryPoint" sub="executes bundle" accent />
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={s.badge('green')}>Pre-flight simulation</span>
      <span style={s.badge('gray')}>Alchemy · Pimlico · Stackup</span>
    </div>
  </div>
);

/* ── 4. Paymaster — sponsor gate ─────────────────────────── */
const I4 = () => (
  <div style={{ ...s.col, gap: 10, width: '100%', padding: '4px 0' }}>
    {/* flow in */}
    <div style={s.row}>
      <N label="UserOp" sub="user submits" />
      <Ra />
      <N label="EntryPoint" sub="processing" accent />
      <Ra />
      <N label="Paymaster" sub="policy check" />
    </div>
    <Da />
    {/* decision */}
    <div style={{ padding: '7px 18px', borderRadius: 10, background: 'var(--bg-surface)', border: '1.5px solid var(--border-light)', fontSize: 11, fontWeight: 700, color: 'var(--text-main)' }}>
      validatePaymasterUserOp()
    </div>
    <div style={{ ...s.row, gap: 16 }}>
      {/* allow branch */}
      <div style={{ ...s.col, gap: 6 }}>
        <div style={{ width: 1, height: 16, background: 'rgba(34,197,94,0.4)', margin: '0 auto' }} />
        <N label="✓ Policy Met" sub="allowed" accent />
        <Da />
        <N label="Pay Gas" sub="in ETH or ERC-20" />
        <Da />
        <N label="Execute" sub="UserOp runs" />
      </div>
      <div style={{ width: 1, height: 120, background: 'var(--border-light)' }} />
      {/* reject branch */}
      <div style={{ ...s.col, gap: 6 }}>
        <div style={{ width: 1, height: 16, background: 'rgba(239,68,68,0.4)', margin: '0 auto' }} />
        <div style={{ padding: '8px 14px', borderRadius: 10, background: '#fef2f2', border: '1.5px solid rgba(239,68,68,0.2)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>✗ Policy Rejected</span>
        </div>
        <Da />
        <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>UserOp reverts</span>
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={s.badge('green')}>Verifying Paymaster</span>
      <span style={s.badge('amber')}>ERC-20 gas token</span>
      <span style={s.badge('gray')}>No ETH in wallet</span>
    </div>
  </div>
);

/* ── 5. Deterministic Addresses — CREATE2 ────────────────── */
/* ── 5. Deterministic Addresses — CREATE3 multichain flow ─ */
const I5 = () => (
  <div style={{ ...s.col, gap: 10, width: '100%', padding: '4px 0' }}>

    {/* Key insight callout */}
    <div style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--bg-surface-green)', border: '1px solid rgba(34,197,94,0.22)', fontSize: 11, fontWeight: 700, color: 'var(--primary-hover)', textAlign: 'center' }}>
      Address = f(CREATE3 Factory, Salt) — bytecode-independent ✓
    </div>

    {/* Inputs */}
    <div style={s.row}>
      <N label="Your Salt" sub="bytes32 unique key" />
      <Ra />
      <N label="CREATE3 Factory" sub="deployed at same addr everywhere" accent />
    </div>
    <Da />

    {/* Two-step CREATE3 mechanism */}
    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-light)', width: '100%', maxWidth: 400 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>CREATE3 — two-step deploy</div>
      <div style={s.row}>
        <div style={{ ...s.col, gap: 3, flex: 1, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-hover)', background: 'var(--bg-surface-green)', padding: '2px 7px', borderRadius: 4 }}>Step 1</span>
          <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-main)', lineHeight: 1.4 }}>Factory uses CREATE2 to deploy a minimal proxy</span>
        </div>
        <Ra />
        <div style={{ ...s.col, gap: 3, flex: 1, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-hover)', background: 'var(--bg-surface-green)', padding: '2px 7px', borderRadius: 4 }}>Step 2</span>
          <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-main)', lineHeight: 1.4 }}>Proxy uses CREATE to deploy your Smart Account</span>
        </div>
      </div>
    </div>
    <Da />

    {/* Resulting address */}
    <div style={{ padding: '8px 16px', borderRadius: 12, background: 'var(--bg-surface)', border: '1.5px solid rgba(34,197,94,0.30)', width: '100%', maxWidth: 400, textAlign: 'center' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Smart Account — same address on every chain</div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--primary)', fontWeight: 700 }}>0x71C7656EC7ab88b098defB751B7401B5f6d8976F</span>
    </div>
    <Da />

    {/* Chains */}
    <div style={{ ...s.row, flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
      {['Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Optimism', 'Amoy'].map(c => (
        <div key={c} style={{ padding: '4px 11px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-light)', fontSize: 11, fontWeight: 650, color: 'var(--text-muted)' }}>{c}</div>
      ))}
    </div>

    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={s.badge('green')}>CREATE3 Factory</span>
      <span style={s.badge('gray')}>Salt-only addressing</span>
      <span style={s.badge('gray')}>Pre-fund before deploy</span>
    </div>
  </div>
);

/* ── 6. Upgradable Accounts — UUPS proxy ─────────────────── */
const I6 = () => (
  <div style={{ ...s.col, gap: 10, width: '100%', padding: '4px 0' }}>
    {/* before upgrade */}
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Before upgrade</div>
    <div style={s.row}>
      <N label="User" sub="calls your address" />
      <Ra />
      <N label="Proxy" sub="0x…same forever" accent />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>delegatecall</span>
        <Ra />
      </div>
      <N label="Impl v1" sub="current logic" />
    </div>
    <Da />
    {/* upgrade step */}
    <div style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--bg-surface-green)', border: '1px solid rgba(34,197,94,0.22)', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-hover)' }}>upgradeTo(Impl v2)</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Guard function validates caller → updates impl slot</div>
    </div>
    <Da />
    {/* after upgrade */}
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>After upgrade</div>
    <div style={s.row}>
      <N label="User" sub="same address" />
      <Ra />
      <N label="Proxy" sub="0x…unchanged" accent />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>delegatecall</span>
        <Ra />
      </div>
      <N label="Impl v2" sub="new logic" />
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={s.badge('green')}>UUPS proxy</span>
      <span style={s.badge('gray')}>Address unchanged</span>
      <span style={s.badge('amber')}>EIP-7702 ready</span>
      <span style={s.badge('gray')}>Zero downtime</span>
    </div>
  </div>
);

const illustrations = [I1, I2, I3, I4, I5, I6];

export default function AAStackDeepDive() {
  const [active, setActive] = useState(0);
  const ActiveIll = illustrations[active];

  return (
    <motion.section
      className="aa-deep-section"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <SectionHeading eyebrow="UNDER THE HOOD" title="The complete Account Abstraction stack." sub="Every layer explained. Every piece production-ready." />
      <div className="aa-deep-grid">
        {/* Left — accordion */}
        <div className="aa-accordion">
          {deepDiveItems.map(([title, body, bullets], i) => (
            <button key={title} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)}>
              <div className="aa-accordion-head">
                <strong>{String(i + 1).padStart(2, '0')}</strong>
                <span>{title}</span>
                <ChevronRight size={18} />
              </div>
              <AnimatePresence>
                {i === active && (
                  <motion.div
                    className="aa-accordion-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <p>{body}</p>
                    {bullets.map(b => <em key={b}>· {b}</em>)}
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          ))}
        </div>

        {/* Right — illustration */}
        <div className="aa-illustration-panel">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}
            >
              <ActiveIll />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}
