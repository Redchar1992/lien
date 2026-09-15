import { useCallback, useRef, useState } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { deployment as d } from './deployments'
import { sendWrite, type TxState, type WriteRequest } from '@lien/sdk'

/** Thin hook wrapping the SDK's framework-agnostic write runner + status. */
export function useTx() {
  const publicClient = usePublicClient({ chainId: d.chainId })
  const { data: walletClient } = useWalletClient()
  const locked = useRef(false)
  const lastConfirmedBlock = useRef<bigint>()
  const lastHash = useRef<`0x${string}`>()
  const [state, setState] = useState<TxState>({ status: 'idle' })

  const run = useCallback(
    async (req: WriteRequest): Promise<TxState | undefined> => {
      if (locked.current) return undefined
      if (!publicClient || !walletClient) {
        setState({ status: 'failed', error: { code: 'NETWORK', message: '请连接测试网钱包 / Connect a testnet wallet.' } })
        return undefined
      }
      locked.current = true
      try {
        const result = await sendWrite(publicClient, walletClient, { ...req, minimumBlock: lastConfirmedBlock.current }, setState)
        if (result.status === 'confirmed') lastConfirmedBlock.current = result.blockNumber
        lastHash.current = result.hash
        locked.current = result.status === 'unknown'
        return result
      } catch {
        locked.current = false
        setState({ status: 'failed', error: { code: 'NETWORK', message: '交易客户端异常；请检查钱包与网络状态。 / Client error; check wallet and network.' } })
        return undefined
      }
    },
    [publicClient, walletClient],
  )

  const check = useCallback(async () => {
    if (!publicClient || !lastHash.current) return
    const hash = lastHash.current
    setState({ status: 'pending', hash })
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash })
      lastConfirmedBlock.current = receipt.blockNumber
      setState({ status: receipt.status === 'success' ? 'confirmed' : 'failed', hash })
      locked.current = false
    } catch {
      setState({ status: 'unknown', hash, error: { code: 'NETWORK', message: '暂未获得回执；请在浏览器核对，勿重复提交。 / No receipt yet; do not resubmit.' } })
    }
  }, [publicClient])
  const busy = ['building', 'signing', 'pending', 'unknown'].includes(state.status)
  return { state, run, check, busy }
}
