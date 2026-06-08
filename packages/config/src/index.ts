/**
 * Chain + deployment config for lien (EVM-native, target Base Sepolia).
 * Mirrors the structure of the TRON sibling's config package but on viem chains.
 */

export type NetworkId = 'baseSepolia' | 'sepolia'

export interface NetworkConfig {
  id: NetworkId
  name: string
  chainId: number
  rpcUrl: string
  explorer: string
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  baseSepolia: {
    id: 'baseSepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
  },
  sepolia: {
    id: 'sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: 'https://rpc.sepolia.org',
    explorer: 'https://sepolia.etherscan.io',
  },
}

export const DEFAULT_NETWORK: NetworkId = 'baseSepolia'

/** Morpho-style isolated market params (loan/collateral/oracle/irm/lltv). Filled at deploy (M3). */
export interface MarketParams {
  loanToken: `0x${string}`
  collateralToken: `0x${string}`
  oracle: `0x${string}`
  irm: `0x${string}`
  /** liquidation LTV, 1e18-scaled */
  lltv: string
}

export interface Deployment {
  /** singleton isolated-market engine (vendored Morpho) */
  engine: `0x${string}` | null
  /** permissioned RWA token */
  rwaToken: `0x${string}` | null
  /** KYC identity registry */
  identityRegistry: `0x${string}` | null
  /** NAV oracle */
  navOracle: `0x${string}` | null
  markets: MarketParams[]
}

export const DEPLOYMENTS: Record<NetworkId, Deployment | null> = {
  baseSepolia: null, // populated by M5 deploy
  sepolia: null,
}
