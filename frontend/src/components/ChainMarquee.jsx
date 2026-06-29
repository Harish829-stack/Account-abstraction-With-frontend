import React from 'react';
import { motion } from 'framer-motion';

const chains = [
  { name: "Ethereum", url: "https://cryptologos.cc/logos/ethereum-eth-logo.svg" },
  { name: "Base", url: "https://icons.llamao.fi/icons/chains/rsz_base.jpg" },
  { name: "Arbitrum", url: "https://cryptologos.cc/logos/arbitrum-arb-logo.svg" },
  { name: "Optimism", url: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg" },
  { name: "Polygon", url: "https://cryptologos.cc/logos/polygon-matic-logo.svg" },
  { name: "zkSync", url: "https://icons.llamao.fi/icons/chains/rsz_zksync%20era.jpg" },
  { name: "Linea", url: "https://icons.llamao.fi/icons/chains/rsz_linea.jpg" },
  { name: "Scroll", url: "https://icons.llamao.fi/icons/chains/rsz_scroll.jpg" },
  { name: "Avalanche", url: "https://cryptologos.cc/logos/avalanche-avax-logo.svg" },
  { name: "BNB Chain", url: "https://cryptologos.cc/logos/bnb-bnb-logo.svg" },
];

export default function ChainMarquee() {
  const row = [...chains, ...chains];
  return (
    <motion.section 
      className="aa-chain-section"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <p>Deployed across every major EVM chain</p>
      <div className="aa-chain-marquee">
        <div className="aa-chain-track">
          {row.map((chain, i) => (
            <div className="aa-chain-item" key={`${chain.name}-${i}`}>
              <img src={chain.url} alt="" />
              <span>{chain.name}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
