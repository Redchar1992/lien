import { createConfig } from 'ponder'
import { http } from 'viem'

// Event ABIs (only the events we index). Addresses + start block come from env,
// filled by the M5 deploy. `pnpm install` here, then `ponder dev`.
const subscriptionManagerEvents = [
  { type: 'event', name: 'Subscribed', inputs: [
    { name: 'user', type: 'address', indexed: true },
    { name: 'usdcIn', type: 'uint256' }, { name: 'rwaOut', type: 'uint256' }, { name: 'nav', type: 'uint256' },
  ] },
  { type: 'event', name: 'RedemptionRequested', inputs: [
    { name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true },
    { name: 'rwaIn', type: 'uint256' }, { name: 'usdcOwed', type: 'uint256' },
    { name: 'claimableAt', type: 'uint64' }, { name: 'nav', type: 'uint256' },
  ] },
  { type: 'event', name: 'RedemptionClaimed', inputs: [
    { name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true },
    { name: 'usdcOut', type: 'uint256' },
  ] },
] as const

const navOracleEvents = [
  { type: 'event', name: 'NavUpdated', inputs: [
    { name: 'nav', type: 'uint256' }, { name: 'updatedAt', type: 'uint64' }, { name: 'forced', type: 'bool' },
  ] },
] as const

const liquidationRouterEvents = [
  { type: 'event', name: 'Liquidated', inputs: [
    { name: 'liquidator', type: 'address', indexed: true }, { name: 'borrower', type: 'address', indexed: true },
    { name: 'seized', type: 'uint256' }, { name: 'repaid', type: 'uint256' }, { name: 'profitPaid', type: 'uint256' },
  ] },
] as const

const startBlock = Number(process.env.PONDER_START_BLOCK ?? 0)

export default createConfig({
  chains: { baseSepolia: { id: 84532, rpc: http(process.env.PONDER_RPC_URL_84532) } },
  contracts: {
    SubscriptionManager: {
      chain: 'baseSepolia',
      abi: subscriptionManagerEvents,
      address: process.env.ADDR_SUBSCRIPTION_MANAGER as `0x${string}`,
      startBlock,
    },
    NavOracle: {
      chain: 'baseSepolia',
      abi: navOracleEvents,
      address: process.env.ADDR_NAV_ORACLE as `0x${string}`,
      startBlock,
    },
    LiquidationRouter: {
      chain: 'baseSepolia',
      abi: liquidationRouterEvents,
      address: process.env.ADDR_LIQUIDATION_ROUTER as `0x${string}`,
      startBlock,
    },
  },
})
