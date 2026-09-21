import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  rabbyWallet,
  braveWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { sepolia, polygonAmoy, holesky, baseSepolia, optimismSepolia } from 'wagmi/chains';
import { getSupportedChainIds } from './config/chains';

const viemChainsById = {
  [sepolia.id]: sepolia,
  [polygonAmoy.id]: polygonAmoy,
  [holesky.id]: holesky,
  [baseSepolia.id]: baseSepolia,
  [optimismSepolia.id]: optimismSepolia,
};

const activeChains = getSupportedChainIds()
  .map((chainId) => viemChainsById[chainId])
  .filter(Boolean);

const configuredChains = activeChains.length > 0 ? activeChains : [sepolia];

/**
 * RainbowKit + Wagmi configuration.
 *
 * Wallets (browser-extension only — no WalletConnect ID needed):
 *   MetaMask, Coinbase Wallet, Rabby, Brave, + any other injected wallet
 *
 * Chains are sourced from src/config/chains.js so wallet config and app
 * network behavior stay in lockstep.
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
  chains: configuredChains,
  ssr: false,
});
