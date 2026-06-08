import { useCallback, useState } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { sendWrite, type TxState, type WriteRequest } from '@lien/sdk'

/** Thin hook wrapping the SDK's framework-agnostic write runner + status. */
export function useTx() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState<TxState>({ status: 'idle' })

  const run = useCallback(
    async (req: WriteRequest): Promise<TxState | undefined> => {
      if (!publicClient || !walletClient) return undefined
      return sendWrite(publicClient, walletClient, req, setState)
    },
    [publicClient, walletClient],
  )

  return { state, run }
}
