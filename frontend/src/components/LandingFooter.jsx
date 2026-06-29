import React from 'react';
import { Code, Send, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LandingFooter() {
  const columns = [
    ["Product", ["Smart Accounts", "Bundler", "Paymaster", "Modules", "Pricing"]],
    ["Standards", ["ERC-4337", "ERC-7579", "EIP-7702", "EntryPoint v0.7"]],
    ["Resources", ["Documentation", "GitHub", "Blog", "Contact", "FAQ"]],
  ];
  return (
    <motion.footer 
      className="aa-footer"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <div className="aa-footer-grid">
        <div>
          <h3>Smart Wallet</h3>
          <p>Modular smart accounts for every application.</p>
          <div className="aa-socials">
            <a><Code size={18}/></a>
            <a><Send size={18}/></a>
            <a><MessageCircle size={18}/></a>
          </div>
        </div>
        {columns.map(([heading, links]) => (
          <div key={heading}>
            <h4>{heading}</h4>
            {links.map(l => <a key={l}>{l}</a>)}
          </div>
        ))}
      </div>
      <div className="aa-footer-bottom">
        <span>© 2026 Smart Wallet. All rights reserved.</span>
        <span>Terms of Service · Privacy Policy</span>
      </div>
    </motion.footer>
  );
}
