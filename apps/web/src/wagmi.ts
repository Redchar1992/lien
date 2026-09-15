import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets'
import { http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'lien',
  // The published demo uses injected wallets only: no fake WalletConnect ID,
  // paid RPC key or private signer is bundled into the static client.
  wallets: [{ groupName: 'Browser wallet', wallets: [injectedWallet] }],
  projectId: 'injected-only', // required by the factory; not used by injectedWallet
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http(import.meta.env.VITE_BASE_SEPOLIA_RPC || undefined) },
  ssr: false,
})
