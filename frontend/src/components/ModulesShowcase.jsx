import React from 'react';
import { Key, Users, Fingerprint, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { SectionHeading } from './Shared';

export default function ModulesShowcase() {
  const modules = [
    ["Session Keys", "Validator Module", <Key size={40} />, "Grant a dApp limited signing rights for a time window or transaction count. Approve once, then agents act within strict, revocable bounds.", ["Time-bounded permissions", "Scoped to contracts & methods", "Revocable instantly on-chain", "Zero full-key exposure"], "violet"],
    ["Social Recovery", "Recovery Module", <Users size={40} />, "Assign trusted guardians. If access is lost, guardians sign a recovery operation that replaces the owner key. No seed phrase. No central authority.", ["M-of-N guardian threshold", "Time-lock delay", "Guardian anonymity preserved", "Compatible with any ERC-7579 account"], "cyan"],
    ["WebAuthn / Passkeys", "Validator Module", <Fingerprint size={40} />, "Sign with Face ID, Touch ID, or hardware security key. P-256 verified on-chain. No seed phrase, no extension, smooth onboarding.", ["Hardware-backed key", "P-256 verified on-chain", "Mobile and desktop browsers", "Fully self-custodial"], "emerald"],
  ];
  return (
    <motion.section 
      className="aa-modules-section"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <SectionHeading eyebrow="ERC-7579 MODULES" title="Modular by design. Powerful by default." sub="Install any module. Extend any behavior. No redeployment, ever." />
      <div className="aa-module-grid">
        {modules.map(([title, badge, icon, body, checks, color], index) => (
          <motion.div 
            className={`aa-module-card aa-module-${color}`} 
            key={title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <div className="aa-module-top"><span>{badge}</span><div>{icon}</div></div>
            <h3>{title}</h3><p>{body}</p>
            <div className="aa-check-list">
              {checks.map(c => <span key={c}><Check size={16} />{c}</span>)}
            </div>
            <i />
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
