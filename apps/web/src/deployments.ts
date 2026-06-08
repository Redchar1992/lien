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

/** Base Sepolia deployment (M5, 2026-06-08). Deploy block ~42574053. */
export const deployment: LienDeployment = {
  chainId: 84532,
  isDeployed: true,
  usdc: '0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5',
  rwaToken: '0xd59D41cF09D4c9Cf06723f0d04E5Fb7976AE481C',
  identityRegistry: '0x47eA4Cddbc918204F5cbCB27F88c1e02Ce746618',
  navOracle: '0xF8d443fDC625a3f0990cdAb6Ac6B5Da5e379017d',
  subscriptionManager: '0x8Fe81a819c6280678b607fDCCC09AB54e526E48b',
  morpho: '0x62bd467F599153e8E3C46c6629CA2b774AF405B4',
  liquidationRouter: '0xdBc5Fe8F7Bc3cd34F5fBdBb670F1Aa7690d25375',
  marketParams: {
    loanToken: '0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5',
    collateralToken: '0xd59D41cF09D4c9Cf06723f0d04E5Fb7976AE481C',
    oracle: '0x86e9000956B488192F3e572d2C73c0C0DfCB7b0b', // MorphoNavOracleAdapter
    irm: '0x321d1C1c124dE4B7F7F13371339ddd852b2b7132',
    lltv: 860000000000000000n,
  },
  usdcDecimals: 6,
  rwaDecimals: 18,
}
