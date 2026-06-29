import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionHeading } from './Shared';

const faqItems = [
  ["What is ERC-4337 and how is it different from a regular wallet?", "ERC-4337 introduces smart contract wallets using a separate UserOperation mempool. Unlike EOAs, smart accounts support custom signature logic, batch transactions, gas sponsorship, and programmable rules without protocol changes."],
  ["What does ERC-7579 add on top of ERC-4337?", "ERC-7579 defines a standard for modular smart accounts. It lets you install and uninstall validators, executors, hooks, and fallbacks at runtime without redeploying."],
  ["What is a Session Key and when should I use one?", "A Session Key is a scoped, time-limited key that acts within predefined rules like time window, contract, method, or spend limit. Use it for gaming, subscriptions, and agent workflows."],
  ["How does gasless UX work with the Paymaster?", "A Paymaster is registered with the EntryPoint and agrees to cover gas. Verifying Paymasters authorize sponsorship off-chain, while ERC-20 Paymasters deduct cost in tokens like USDC."],
  ["How does deterministic deployment work across chains?", "Using CREATE2, the factory computes your account address from salt and bytecode before deployment. The first UserOp can deploy the account automatically."],
  ["Can I upgrade my smart account without losing my address?", "Yes. The UUPS proxy keeps your address and storage in the proxy while implementation logic can be upgraded. Your funds and modules stay put."],
  ["What makes WebAuthn better than seed phrases?", "WebAuthn uses Face ID, Touch ID, or security keys to generate hardware-backed credentials. The private key never leaves the device, and P-256 signatures can be verified on-chain."],
];

export default function FAQAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <motion.section 
      className="aa-faq-section" 
      id="faq"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <SectionHeading eyebrow="FAQ" title="Common Questions" />
      <div className="aa-faq-list">
        {faqItems.map(([q, a], i) => (
          <button key={q} className={open === i ? 'is-open' : ''} onClick={() => setOpen(open === i ? -1 : i)}>
            <span>{q}<ChevronDown size={18} /></span>
            <AnimatePresence>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ overflow: 'hidden' }}
                >
                  <p>{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        ))}
      </div>
    </motion.section>
  );
}
