import { BrowserProvider, JsonRpcSigner, JsonRpcProvider, hexlify } from 'ethers';
import { getChainConfig, getReadRpcUrl } from '../config/chains';

/**
 * Converts a Wagmi/Viem WalletClient into an ethers v6 JsonRpcSigner.
 *
 * This bridge allows all existing AA code (bundler.js, helpers.js, views)
 * to continue using ethers v6 APIs (signer.signMessage, signer.sendTransaction, etc.)
 * without any changes, while the wallet connection layer uses RainbowKit + Wagmi.
 *
 * @param {import('viem').WalletClient} walletClient - The viem WalletClient from useWalletClient()
 * @returns {JsonRpcSigner} An ethers v6 JsonRpcSigner bound to the connected account
 */
export function walletClientToSigner(walletClient) {
  const { account, chain, transport } = walletClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network);
  const signer = new JsonRpcSigner(provider, account.address);
  
  // Override signMessage to use viem's native signMessage, bypassing the Ethers/Viem transport mismatch
  // This guarantees that signature prompts for UserOps will pop up in MetaMask/Rabby.
  signer.signMessage = async (message) => {
    let rawMessage;
    // Ethers v6 passes Uint8Array for hashes (via ethers.getBytes(hash))
    if (message instanceof Uint8Array) {
      rawMessage = hexlify(message);
    } else {
      rawMessage = message; // string
    }

    // Call wagmi/viem directly to prompt the user
    return await walletClient.signMessage({
      account: account.address,
      message: { raw: rawMessage },
    });
  };

  return signer;
}

/**
 * Creates an ethers v6 JsonRpcProvider for read-only operations from env RPC URLs.
 * Falls back to the wagmi publicClient transport if no dedicated RPC is configured.
 *
 * @param {number} chainId - The current chain ID
 * @returns {JsonRpcProvider | null}
 */
export function getReadProvider(chainId) {
  const rpcUrl = getReadRpcUrl(chainId);
  const chain = getChainConfig(chainId);

  if (rpcUrl && chain) {
    return new JsonRpcProvider(rpcUrl, { chainId: chain.chainId, name: chain.name });
  }
  // For other chains, return null — AppContext will use the BrowserProvider from walletClient
  return null;
}
