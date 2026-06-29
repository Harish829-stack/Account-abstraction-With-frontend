import React from 'react';
import { motion } from 'framer-motion';

export default function Newsletter() {
  return (
    <motion.section 
      className="aa-newsletter"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <div>
        <h3>Get updates on new modules and releases.</h3>
        <p>No spam. Unsubscribe anytime.</p>
      </div>
      <form onSubmit={(e) => e.preventDefault()}>
        <input type="email" placeholder="your@email.com" />
        <button>Subscribe</button>
      </form>
    </motion.section>
  );
}
