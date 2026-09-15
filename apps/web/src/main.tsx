import React, { lazy, Suspense, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Demo } from './demo/Demo'
import './styles.css'
const Testnet = lazy(() => import('./Testnet'))
function Root() {
  // Deliberately ignore URL parameters: opening any shared URL is wallet-free.
  const [mode, setMode] = useState<'demo' | 'testnet'>('demo')
  return <><nav className="mode-switch" aria-label="运行模式"><span>运行模式</span><button aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>模拟体验 · 无需钱包</button><button aria-pressed={mode === 'testnet'} onClick={() => setMode('testnet')}>Base Sepolia · 测试网</button></nav>{mode === 'demo' ? <Demo /> : <Suspense fallback={<div className="app" role="status">正在加载测试网客户端…</div>}><Testnet /></Suspense>}</>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
