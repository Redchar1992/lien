import { useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erc20Abi, formatUnits, zeroAddress, type Address } from 'viem'
import { vaultAbi } from '@lien/sdk'
import { deployment as d } from '../deployments'
import { amount } from '../demo/model'
import { useTx } from '../tx'
import { TxFeedback } from './TxFeedback'

export function VaultPanel() {
  if (!d.vault) return <section className="card section"><h2>ERC-4626 · USDC 金库</h2><p className="sub">此测试网部署尚未配置金库地址，链上存取不可用。请切回模拟体验；不会用模拟份额冒充链上余额。</p></section>
  return <ConnectedVault vault={d.vault} />
}
function ConnectedVault({ vault }: { vault: Address }) {
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: d.chainId })
  const queryClient = useQueryClient()
  const { state, run, check, busy } = useTx()
  const [deposit, setDeposit] = useState('')
  const [withdraw, setWithdraw] = useState('')
  const assetsIn = amount(deposit), assetsOut = amount(withdraw)
  const owner = address ?? zeroAddress
  const { data, isError, isFetching } = useQuery({
    queryKey: ['vault', d.chainId, vault, owner, deposit, withdraw],
    enabled: Boolean(client), refetchInterval: 8_000, retry: 1,
    queryFn: async () => {
      if (!client) throw new Error('No RPC client')
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
      const read = { address: vault, abi: vaultAbi, blockNumber } as const
      const [asset, engine, total, liquid, maxOut, maxShares, inShares, outShares, shares, decimals, usdc, allowance] = await Promise.all([
        client.readContract({ ...read, functionName: 'asset' }),
        client.readContract({ ...read, functionName: 'morpho' }),
        client.readContract({ ...read, functionName: 'totalAssets' }),
        client.readContract({ ...read, functionName: 'availableLiquidity' }),
        client.readContract({ ...read, functionName: 'maxWithdraw', args: [owner] }),
        client.readContract({ ...read, functionName: 'maxRedeem', args: [owner] }),
        client.readContract({ ...read, functionName: 'previewDeposit', args: [assetsIn] }),
        client.readContract({ ...read, functionName: 'previewWithdraw', args: [assetsOut] }),
        client.readContract({ address: vault, abi: erc20Abi, functionName: 'balanceOf', args: [owner], blockNumber }),
        client.readContract({ address: vault, abi: erc20Abi, functionName: 'decimals', blockNumber }),
        client.readContract({ address: d.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [owner], blockNumber }),
        client.readContract({ address: d.usdc, abi: erc20Abi, functionName: 'allowance', args: [owner, vault], blockNumber }),
      ])
      if (asset.toLowerCase() !== d.usdc.toLowerCase() || engine.toLowerCase() !== d.morpho.toLowerCase()) throw new Error('Vault asset/engine mismatch')
      return { total, liquid, maxOut, maxShares, inShares, outShares, shares, decimals, usdc, allowance, blockNumber }
    },
  })
  const disabled = !address || chainId !== d.chainId || !data || isError || isFetching || busy
  async function submit(kind: 'deposit' | 'withdraw' | 'redeem') {
    if (disabled || !address || !data) return
    if (kind === 'deposit' && data.allowance < assetsIn) {
      const approved = await run({ address: d.usdc, abi: erc20Abi, functionName: 'approve', args: [vault, assetsIn] })
      if (approved?.status !== 'confirmed') return
    }
    const args = kind === 'deposit' ? [assetsIn, address] : [kind === 'withdraw' ? assetsOut : data.maxShares, address, address]
    const result = await run({ address: vault, abi: vaultAbi, functionName: kind, args })
    if (result?.status === 'confirmed') {
      setDeposit(''); setWithdraw(''); await queryClient.invalidateQueries()
    }
  }
  const usd = (n?: bigint) => n === undefined ? '—' : formatUnits(n, 6)
  const share = (n?: bigint) => n === undefined || !data ? '—' : formatUnits(n, data.decimals)
  return <section className="card section" id="vault"><h2>ERC-4626 · USDC 金库 <span className="badge warn">测试网</span></h2>
    <p className="sub">mock USDC 存取；份额与资金来自链上读取，不是模拟余额。金额按 USDC 6 位精度。</p>
    <div className="metrics"><span>总资产<strong>{usd(data?.total)} USDC</strong></span><span>可用现金<strong>{usd(data?.liquid)} USDC</strong></span><span>我的份额<strong>{address ? share(data?.shares) : '—'}</strong></span><span>我可提取<strong>{address ? usd(data?.maxOut) : '—'} USDC</strong></span></div>
    {isError && <p role="alert">金库读取失败或资产/市场配置不匹配；已禁用写入。请检查 RPC 与部署地址。</p>}
    {!address && <p className="sub">连接钱包后可查看个人余额、存入与退出。</p>}
    {address && chainId !== d.chainId && <p role="alert">请先切换到 Base Sepolia；不会向其他网络提交交易。</p>}
    <div className="grid"><div><label htmlFor="vault-deposit">金库存入（USDC）</label><div className="row"><input id="vault-deposit" value={deposit} inputMode="decimal" onChange={e => setDeposit(e.target.value)} /><button disabled={disabled || assetsIn <= 0n || assetsIn > (data?.usdc ?? 0n) || (data?.inShares ?? 0n) === 0n} onClick={() => submit('deposit')}>授权并存入</button></div><p className="sub">钱包：{address ? usd(data?.usdc) : '—'} USDC · 预计新增 {share(data?.inShares)} 份额</p></div>
    <div><label htmlFor="vault-withdraw">金库提取（USDC）</label><div className="row"><input id="vault-withdraw" value={withdraw} inputMode="decimal" onChange={e => setWithdraw(e.target.value)} /><button disabled={disabled || assetsOut <= 0n || assetsOut > (data?.maxOut ?? 0n)} onClick={() => submit('withdraw')}>提取 USDC</button></div><p className="sub">预计销毁 {share(data?.outShares)} 份额；超出当前可提金额不可提交。</p></div></div>
    <button className="secondary" disabled={disabled || (data?.maxShares ?? 0n) === 0n} onClick={() => submit('redeem')}>赎回当前可退出份额</button>
    <TxFeedback state={state} check={async () => { await check(); await queryClient.invalidateQueries() }} />
    <p className="sub">预览不是成交承诺；区块与利息可能变化，链上会再次校验。此版本未提供用户自定义 min-shares / max-shares 保护，不适用于生产资金。</p>
    <a className="link" href={`https://sepolia.basescan.org/address/${vault}`} target="_blank" rel="noreferrer">LienVault ↗</a>{data && <span className="sub"> · 读取区块 {data.blockNumber.toString()}</span>}
  </section>
}
