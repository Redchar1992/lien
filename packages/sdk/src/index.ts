/**
 * Transaction-lifecycle SDK for lien (viem-based).
 *
 * Ports the state-machine + exhaustive error-code design from the TRON sibling's
 * SDK (which replaced a god-object) onto viem — the concrete proof that the
 * full-stack pattern is chain-portable: TronWeb → viem is an interface swap, not
 * a rewrite. The React app pairs this with wagmi hooks; the error decoder turns
 * raw reverts into stable, friendly codes (incl. RWA-specific ones).
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem'

export * from './abis'
export * from './market'

export type TxStatus = 'idle' | 'building' | 'signing' | 'pending' | 'confirmed' | 'failed'

export type TxErrorCode =
  | 'USER_REJECTED'
  | 'NOT_KYC' // recipient not on the compliance allowlist
  | 'TRANSFER_RESTRICTED' // RWA transfer blocked / account frozen
  | 'NAV_STALE' // NAV oracle stale or paused -> market frozen
  | 'INSUFFICIENT_COLLATERAL'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'CONFIRM_TIMEOUT'
  | 'NETWORK'
  | 'REVERTED'

export interface TxError {
  code: TxErrorCode
  message: string
}

export interface TxState {
  status: TxStatus
  hash?: Hex
  error?: TxError
}

const CODE_MESSAGE: Record<TxErrorCode, string> = {
  USER_REJECTED: '你取消了签名 / Signature was declined.',
  NOT_KYC: '收款地址未通过 KYC,无法持有该 RWA。 / Recipient is not KYC-verified.',
  TRANSFER_RESTRICTED: '转账受合规限制(对方或你被冻结)。 / Transfer blocked by compliance.',
  NAV_STALE: 'NAV 预言机过期/暂停,市场已冻结。 / NAV feed is stale; market frozen.',
  INSUFFICIENT_COLLATERAL: '抵押不足。 / Insufficient collateral.',
  INSUFFICIENT_LIQUIDITY: '市场可借流动性不足。 / Insufficient market liquidity.',
  INSUFFICIENT_BALANCE: '余额不足。 / Insufficient balance.',
  INSUFFICIENT_ALLOWANCE: '授权额度不足。 / Insufficient allowance.',
  CONFIRM_TIMEOUT: '确认超时。 / Confirmation timed out.',
  NETWORK: '网络错误,请重试。 / Network error.',
  REVERTED: '交易回滚。 / Transaction reverted.',
}

function textOf(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw.toLowerCase()
  const e = raw as { shortMessage?: string; message?: string; details?: string }
  return `${e.shortMessage ?? ''} ${e.message ?? ''} ${e.details ?? ''}`.toLowerCase()
}

function classify(text: string): TxErrorCode {
  if (text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) return 'USER_REJECTED'
  if (text.includes('recipient not verified') || text.includes('new wallet not verified')) return 'NOT_KYC'
  if (text.includes('frozen')) return 'TRANSFER_RESTRICTED'
  if (text.includes('nav: stale') || text.includes('nav: paused')) return 'NAV_STALE'
  if (text.includes('insufficient collateral')) return 'INSUFFICIENT_COLLATERAL'
  if (text.includes('insufficient liquidity')) return 'INSUFFICIENT_LIQUIDITY'
  if (text.includes('allowance')) return 'INSUFFICIENT_ALLOWANCE'
  if (text.includes('transfer amount exceeds balance') || text.includes('insufficient balance')) return 'INSUFFICIENT_BALANCE'
  if (text.includes('timed out') || text.includes('timeout')) return 'CONFIRM_TIMEOUT'
  if (text.includes('network') || text.includes('fetch') || text.includes('connection')) return 'NETWORK'
  return 'REVERTED'
}

/** Map a raw viem/wallet error into a structured {@link TxError}. */
export function decodeTxError(raw: unknown): TxError {
  const code = classify(textOf(raw))
  return { code, message: CODE_MESSAGE[code] ?? CODE_MESSAGE.REVERTED }
}

export interface WriteRequest {
  address: Address
  abi: readonly unknown[]
  functionName: string
  args: readonly unknown[]
}

export type TxStateListener = (s: TxState) => void

/**
 * Framework-agnostic write runner: simulate → sign → wait, emitting TxState
 * transitions. The React app may use this directly or rely on wagmi's hooks +
 * {@link decodeTxError}; both share the same error taxonomy.
 */
export async function sendWrite(
  publicClient: PublicClient,
  walletClient: WalletClient,
  req: WriteRequest,
  onState?: TxStateListener,
): Promise<TxState> {
  const account = walletClient.account
  if (!account) {
    const error: TxError = { code: 'REVERTED', message: 'No connected account.' }
    onState?.({ status: 'failed', error })
    return { status: 'failed', error }
  }
  try {
    onState?.({ status: 'building' })
    // simulate first so reverts surface with a decodable reason before signing
    const { request } = await publicClient.simulateContract({
      account,
      address: req.address,
      abi: req.abi as never,
      functionName: req.functionName as never,
      args: req.args as never,
    })
    onState?.({ status: 'signing' })
    const hash = await walletClient.writeContract(request as never)
    onState?.({ status: 'pending', hash })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      const error: TxError = { code: 'REVERTED', message: CODE_MESSAGE.REVERTED }
      const failed: TxState = { status: 'failed', hash, error }
      onState?.(failed)
      return failed
    }
    const ok: TxState = { status: 'confirmed', hash }
    onState?.(ok)
    return ok
  } catch (err) {
    const error = decodeTxError(err)
    const failed: TxState = { status: 'failed', error }
    onState?.(failed)
    return failed
  }
}

export const SDK_VERSION = '0.1.0'
