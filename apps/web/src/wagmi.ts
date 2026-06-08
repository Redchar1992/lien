import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'lien',
  // injected wallets work without this; a real WalletConnect id can be supplied via env.
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? 'lien-demo',
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
  ssr: false,
})
