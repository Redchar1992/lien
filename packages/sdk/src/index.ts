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

export type TxStatus = 'idle' | 'building' | 'signing' | 'pending' | 'confirmed' | 'failed' | 'unknown'

export type TxErrorCode =
  | 'WRONG_NETWORK'
  | 'ACCOUNT_CHANGED'
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
  blockNumber?: bigint
  error?: TxError
}

const CODE_MESSAGE: Record<TxErrorCode, string> = {
  WRONG_NETWORK: '请切换到配置的测试网。 / Switch to the configured test network.',
  ACCOUNT_CHANGED: '钱包账户已变化，请重新连接。 / Wallet account changed; reconnect.',
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
  if (text.includes('transfer amount exceeds balance') || text.includes('insufficient balance') || text.includes('erc20insufficientbalance')) return 'INSUFFICIENT_BALANCE'
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
  /** Never preflight earlier than a preceding approval receipt. */
  minimumBlock?: bigint
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
  let hash: Hex | undefined
  let cancelled = false
  try {
    onState?.({ status: 'building' })
    const chainId = await walletClient.getChainId()
    if (!publicClient.chain || chainId !== publicClient.chain.id) {
      const failed: TxState = { status: 'failed', error: { code: 'WRONG_NETWORK', message: CODE_MESSAGE.WRONG_NETWORK } }
      onState?.(failed)
      return failed
    }
    const [currentAccount] = await walletClient.getAddresses()
    if (currentAccount?.toLowerCase() !== account.address.toLowerCase()) {
      const failed: TxState = { status: 'failed', error: { code: 'ACCOUNT_CHANGED', message: CODE_MESSAGE.ACCOUNT_CHANGED } }
      onState?.(failed)
      return failed
    }
    // simulate first so reverts surface with a decodable reason before signing
    const head = await publicClient.getBlockNumber({ cacheTime: 0 })
    const blockNumber = req.minimumBlock !== undefined && req.minimumBlock > head ? req.minimumBlock : head
    const { request } = await publicClient.simulateContract({
      account,
      blockNumber,
      address: req.address,
      abi: req.abi as never,
      functionName: req.functionName as never,
      args: req.args as never,
    })
    const estimatedGas = await publicClient.estimateContractGas({
      account, blockNumber, address: req.address, abi: req.abi as never,
      functionName: req.functionName as never, args: req.args as never,
    })
    // Interest accrual and zero/nonzero storage writes can change between
    // estimation and inclusion. Buffer the limit; only used gas is charged.
    const gas = estimatedGas * 130n / 100n + 50_000n
    onState?.({ status: 'signing' })
    hash = await walletClient.writeContract({ ...request, gas } as never)
    onState?.({ status: 'pending', hash })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash, timeout: 120_000, confirmations: 2,
      onReplaced: replacement => {
        hash = replacement.transaction.hash
        cancelled = replacement.reason !== 'repriced'
        onState?.({ status: 'pending', hash })
      },
    })
    hash = receipt.transactionHash
    if (receipt.status !== 'success' || cancelled) {
      const error: TxError = { code: 'REVERTED', message: CODE_MESSAGE.REVERTED }
      const failed: TxState = { status: 'failed', hash, error }
      onState?.(failed)
      return failed
    }
    const ok: TxState = { status: 'confirmed', hash, blockNumber: receipt.blockNumber }
    onState?.(ok)
    return ok
  } catch (err) {
    const error = decodeTxError(err)
    const failed: TxState = hash
      ? { status: 'unknown', hash, error: { ...error, message: '交易已广播，结果未确认。先检查回执，勿重复提交。 / Broadcast; outcome unknown. Check receipt before retrying.' } }
      : { status: 'failed', error }
    onState?.(failed)
    return failed
  }
}

export const SDK_VERSION = '0.1.0'
