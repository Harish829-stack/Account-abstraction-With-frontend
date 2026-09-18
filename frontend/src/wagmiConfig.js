import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  rabbyWallet,
  braveWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { sepolia, polygonAmoy, holesky, baseSepolia, optimismSepolia } from 'wagmi/chains';

/**
 * RainbowKit + Wagmi configuration.
 *
 * Wallets (browser-extension only — no WalletConnect ID needed):
 *   MetaMask, Coinbase Wallet, Rabby, Brave, + any other injected wallet
 *
 * Chains:
 *   Sepolia (11155111)    — full AA support
 *   Polygon Amoy (80002)  — full AA support
 *   Holesky (17000)       — view only
 *   Base Sepolia (84532)  — view only
 *   Optimism Sepolia (11155420) — view only
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'AA Smart Wallet',
  // projectId is required by the type definition but is NOT used
  // when WalletConnect wallets are excluded from the wallets array.
  projectId: 'AA_SMART_WALLET_NO_WC',
  wallets: [
    {
      groupName: 'Browser Wallets',
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        rabbyWallet,
        braveWallet,
        injectedWallet,
      ],
    },
  ],
  chains: [sepolia, polygonAmoy, holesky, baseSepolia, optimismSepolia],
  ssr: false,
});
