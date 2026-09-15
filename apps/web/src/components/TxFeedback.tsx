import type { TxState } from '@lien/sdk'
export function TxFeedback({ state, check }: { state: TxState; check: () => Promise<void> }) {
  if (state.status === 'idle') return null
  return <div className={`txline ${state.status}`} role="status">
    {state.status}{state.error && ` · ${state.error.message}`}
    {state.hash && <> · <a className="link" href={`https://sepolia.basescan.org/tx/${state.hash}`} target="_blank" rel="noreferrer">交易回执 ↗</a></>}
    {state.status === 'unknown' && <button className="secondary" onClick={check}>检查回执</button>}
  </div>
}
