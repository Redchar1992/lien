import { formatUnits } from 'viem'

/** Human display: thousands separators + trimmed decimals. NOT for parsing inputs. */
export function fmt(value: bigint, decimals: number, maxFrac = 2): string {
  const n = Number(formatUnits(value, decimals))
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })
}

/** Full-precision string for filling an input (round-trips through parseUnits). */
export function exact(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
}
