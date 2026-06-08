import type { Address } from 'viem'
import type { MarketParamsOnchain } from '@lien/sdk'

export interface LienDeployment {
  chainId: number
  /** flipped to true by the M5 deploy script once addresses are filled in */
  isDeployed: boolean
  usdc: Address
  rwaToken: Address
  identityRegistry: Address
  navOracle: Address
  subscriptionManager: Address
  morpho: Address
  liquidationRouter: Address
  marketParams: MarketParamsOnchain
  usdcDecimals: number
  rwaDecimals: number
}

const ZERO = '0x0000000000000000000000000000000000000000' as const

/** Base Sepolia deployment — populated by `M5` (scripts/Deploy.s.sol output). */
export const deployment: LienDeployment = {
  chainId: 84532,
  isDeployed: false,
  usdc: ZERO,
  rwaToken: ZERO,
  identityRegistry: ZERO,
  navOracle: ZERO,
  subscriptionManager: ZERO,
  morpho: ZERO,
  liquidationRouter: ZERO,
  marketParams: { loanToken: ZERO, collateralToken: ZERO, oracle: ZERO, irm: ZERO, lltv: 860000000000000000n },
  usdcDecimals: 6,
  rwaDecimals: 18,
}
