import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { wagmiConfig } from './wagmi'
import { LangProvider } from './i18n'
import { App } from './App'

const queryClient = new QueryClient()

export default function Testnet() { return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <LangProvider>
            <App />
          </LangProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>

) }
