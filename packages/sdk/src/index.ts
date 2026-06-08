/**
 * Transaction-lifecycle SDK for lien (viem-based).
 *
 * Ports the state-machine + exhaustive error-code design from the TRON sibling's
 * SDK (which replaced a god-object) onto viem/wagmi — the concrete proof that the
 * full-stack pattern is chain-portable: TronWeb → viem is an interface swap, not a
 * rewrite. Filled in M4.
 */

export type TxStatus =
  | 'idle'
  | 'building'
  | 'signing'
  | 'broadcasting'
  | 'pending'
  | 'confirmed'
  | 'failed'

export type TxErrorCode =
  | 'USER_REJECTED'
  | 'NOT_KYC' // lien-specific: caller not on the compliance allowlist
  | 'INSUFFICIENT_COLLATERAL'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'TRANSFER_RESTRICTED' // RWA token transfer blocked by compliance hook
  | 'NAV_STALE' // NAV oracle price too old / circuit-broken
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'CONFIRM_TIMEOUT'
  | 'NETWORK'
  | 'REVERTED'

export interface TxState {
  status: TxStatus
  hash?: `0x${string}`
  error?: { code: TxErrorCode; message: string }
}

export const SDK_VERSION = '0.0.0'
