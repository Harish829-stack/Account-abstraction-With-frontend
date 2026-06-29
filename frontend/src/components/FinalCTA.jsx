import React from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { SectionHeading } from './Shared';

export default function FinalCTA({ connectWallet, isConnecting }) {
  return (
    <motion.section 
      className="aa-final-cta"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <div className="aa-hero-grid" aria-hidden="true" />
      <SectionHeading eyebrow="READY TO BUILD?" title="Ship your first smart account in under 10 minutes." sub="From EntryPoint to deployed account, sessions, recovery, and gasless UX all wired in." />
      <div className="aa-hero-actions">
        <button className="aa-primary-cta" onClick={connectWallet} disabled={isConnecting}>
          Get Started <ArrowRight size={18} />
        </button>
        <button className="aa-secondary-cta" type="button">
          Read the Docs <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="aa-stats-row">
        <div><strong>ERC-4337</strong><span>Battle-tested standard</span></div>
        <i />
        <div><strong>ERC-7579</strong><span>Modular account standard</span></div>
        <i />
        <div><strong>10+ Chains</strong><span>Same address, everywhere</span></div>
      </div>
    </motion.section>
  );
}
