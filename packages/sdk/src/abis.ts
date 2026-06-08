/**
 * Minimal `as const` ABI fragments for the methods the app calls — kept small and
 * typed so viem/wagmi infer argument and return types. Standard ERC-20 reads use
 * viem's built-in `erc20Abi`.
 */

export const identityRegistryAbi = [
  { type: 'function', name: 'isVerified', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

export const navOracleAbi = [
  { type: 'function', name: 'nav', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'updatedAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'isStale', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
] as const

export const subscriptionManagerAbi = [
  { type: 'function', name: 'subscribe', stateMutability: 'nonpayable', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ name: 'rwaOut', type: 'uint256' }] },
  { type: 'function', name: 'requestRedemption', stateMutability: 'nonpayable', inputs: [{ name: 'rwaAmount', type: 'uint256' }], outputs: [{ name: 'id', type: 'uint256' }] },
  { type: 'function', name: 'claimRedemption', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'previewSubscribe', stateMutability: 'view', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'previewRedeem', stateMutability: 'view', inputs: [{ name: 'rwaAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'settlementDelay', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

// MarketParams tuple shared by the Morpho write methods.
const marketParamsTuple = {
  name: 'marketParams',
  type: 'tuple',
  components: [
    { name: 'loanToken', type: 'address' },
    { name: 'collateralToken', type: 'address' },
    { name: 'oracle', type: 'address' },
    { name: 'irm', type: 'address' },
    { name: 'lltv', type: 'uint256' },
  ],
} as const

export const morphoAbi = [
  {
    type: 'function',
    name: 'position',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }, { name: 'user', type: 'address' }],
    outputs: [
      { name: 'supplyShares', type: 'uint256' },
      { name: 'borrowShares', type: 'uint128' },
      { name: 'collateral', type: 'uint128' },
    ],
  },
  {
    type: 'function',
    name: 'market',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      { name: 'totalSupplyAssets', type: 'uint128' },
      { name: 'totalSupplyShares', type: 'uint128' },
      { name: 'totalBorrowAssets', type: 'uint128' },
      { name: 'totalBorrowShares', type: 'uint128' },
      { name: 'lastUpdate', type: 'uint128' },
      { name: 'fee', type: 'uint128' },
    ],
  },
  {
    type: 'function',
    name: 'supplyCollateral',
    stateMutability: 'nonpayable',
    inputs: [marketParamsTuple, { name: 'assets', type: 'uint256' }, { name: 'onBehalf', type: 'address' }, { name: 'data', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'borrow',
    stateMutability: 'nonpayable',
    inputs: [
      marketParamsTuple,
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'repay',
    stateMutability: 'nonpayable',
    inputs: [
      marketParamsTuple,
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
] as const
