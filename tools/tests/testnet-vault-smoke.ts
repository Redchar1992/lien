/** Manual Base Sepolia smoke only; never part of CI or browser bundles.
 * Default: reads only. --broadcast: withdraw and redeposit 100 mock USDC,
 * redeem 10 shares and redeposit the returned assets, checking every receipt.
 */
import { createPublicClient, createWalletClient, erc20Abi, http, decodeFunctionData } from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { vaultAbi, navOracleAbi } from '../../packages/sdk/src/abis.ts'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const vault = '0xc4ca6BbC70C429F96d19577B641fbe126a0CA93B'
const usdc = '0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5'
const transport = http('https://sepolia.base.org', { timeout: 20_000, retryCount: 1 })
const publicClient = createPublicClient({ chain: baseSepolia, transport })
assert.equal(await publicClient.getChainId(), 84532, 'Base Sepolia only')
assert.equal((await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'asset' })).toLowerCase(), usdc.toLowerCase())
const stale = await publicClient.readContract({ address: '0xF8d443fDC625a3f0990cdAb6Ac6B5Da5e379017d', abi: navOracleAbi, functionName: 'isStale' })
if (!process.argv.includes('--broadcast')) {
  console.log(JSON.stringify({ chainId: 84532, vault, staleNAV: stale, totalAssets: (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'totalAssets' })).toString() }))
  process.exit(0)
}
if (!process.env.PRIVATE_KEY) throw new Error('Testnet burner PRIVATE_KEY required')
const account = privateKeyToAccount((process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`) as `0x${string}`)
const wallet = createWalletClient({ account, chain: baseSepolia, transport })
const records: object[] = []
let lastReceiptBlock: bigint | undefined
async function snapshot(at?: bigint) {
  const blockNumber = at ?? lastReceiptBlock ?? await publicClient.getBlockNumber({ cacheTime: 0 })
  const [cash, shares, maxWithdraw] = await Promise.all([
    publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address], blockNumber }),
    publicClient.readContract({ address: vault, abi: erc20Abi, functionName: 'balanceOf', args: [account.address], blockNumber }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'maxWithdraw', args: [account.address], blockNumber }),
  ])
  return { blockNumber, cash, shares, maxWithdraw }
}
async function write(address: `0x${string}`, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
  const { request } = await publicClient.simulateContract({ address, abi, functionName, args, account, blockNumber: lastReceiptBlock ?? await publicClient.getBlockNumber({ cacheTime: 0 }) } as any)
  const hash = await wallet.writeContract(request)
  console.log(`${functionName}: ${hash}`)
  // No automatic transaction retry after a known hash.
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000, confirmations: 2 })
  assert.equal(receipt.status, 'success')
  lastReceiptBlock = receipt.blockNumber
  records.push({ functionName, hash, blockNumber: receipt.blockNumber, status: receipt.status })
}
const resumeHash = process.argv.find(a => a.startsWith('--resume-withdraw='))?.split('=')[1] as `0x${string}` | undefined
let before
if (resumeHash) {
  // Resume only a verified, already-mined first step; never rebroadcast it.
  const tx = await publicClient.getTransaction({ hash: resumeHash })
  const receipt = await publicClient.getTransactionReceipt({ hash: resumeHash })
  assert.equal(tx.from.toLowerCase(), account.address.toLowerCase())
  assert.equal(tx.to?.toLowerCase(), vault.toLowerCase())
  const decoded = decodeFunctionData({ abi: vaultAbi, data: tx.input })
  assert.equal(decoded.functionName, 'withdraw')
  assert.deepEqual(decoded.args, [100_000_000n, account.address, account.address])
  assert.equal(receipt.status, 'success')
  before = await snapshot(receipt.blockNumber - 1n)
  lastReceiptBlock = receipt.blockNumber
  records.push({ functionName: 'withdraw', hash: resumeHash, blockNumber: receipt.blockNumber, status: receipt.status, resumed: true })
} else {
  before = await snapshot()
  assert(before.maxWithdraw >= 100_000_000n)
  await write(vault, vaultAbi, 'withdraw', [100_000_000n, account.address, account.address])
}
const withdrawn = await snapshot()
assert.equal(withdrawn.cash - before.cash, 100_000_000n)
assert(withdrawn.shares < before.shares)
const allowance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account.address, vault], blockNumber: await publicClient.getBlockNumber({ cacheTime: 0 }) })
if (allowance < 100_000_000n) await write(usdc, erc20Abi, 'approve', [vault, 100_000_000n])
else lastReceiptBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
await write(vault, vaultAbi, 'deposit', [100_000_000n, account.address])
const deposited = await snapshot()
assert.equal(deposited.cash, before.cash); assert(deposited.shares > withdrawn.shares)
await write(vault, vaultAbi, 'redeem', [10_000_000n, account.address, account.address])
const redeemed = await snapshot()
assert.equal(deposited.shares - redeemed.shares, 10_000_000n)
const assetsBack = redeemed.cash - deposited.cash
assert(assetsBack > 0n && assetsBack < 100_000_000n)
await write(usdc, erc20Abi, 'approve', [vault, assetsBack])
await write(vault, vaultAbi, 'deposit', [assetsBack, account.address])
const after = await snapshot()
assert.equal(after.cash, before.cash)
const report = { checkedAt: new Date().toISOString(), chainId: 84532, vault, account: account.address, mockAssetsOnly: true, staleNAV: stale, before, withdrawn, deposited, redeemed, after, transactions: records }
writeFileSync(new URL('../../docs/vault-smoke.json', import.meta.url), JSON.stringify(report, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2)+'\n')
console.log('Verified: withdraw, deposit, redeem, share changes; wallet mock USDC restored.')
