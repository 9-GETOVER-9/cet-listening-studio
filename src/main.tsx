import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AppInitializer } from '@/components/AppInitializer'
import { applyAppTheme } from '@/config/theme'
import { reloadForFreshChunks } from '@/lib/chunkRecovery'
import './index.css'

applyAppTheme()

if ('caches' in window) {
  void caches.delete('audio-files')
  void caches.delete('workbox-audio-files')
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  void reloadForFreshChunks()
})

let offlineRegistered = false
function registerOfflineSupport() {
  if (offlineRegistered) return
  offlineRegistered = true
  registerSW({
    onNeedRefresh() {
      // 非阻断式：使用 toast 提示更新，允许用户稍后刷新
      import('sonner').then(({ toast }) => {
        toast('有新版本可用 ✨', {
          description: '点击刷新获取最新版本',
          action: {
            label: '立即刷新',
            onClick: () => window.location.reload(),
          },
          duration: 30000,
        })
      })
    },
    onOfflineReady() {
      // PWA 离线就绪（生产环境不需要日志）
    },
  })
}

const isPublicDemo = window.location.pathname === '/ielts/reading-538/match'
  && new URLSearchParams(window.location.search).get('play') === 'demo'
const root = createRoot(document.getElementById('root')!)
if (isPublicDemo) {
  root.render(<p className="p-6" role="status">正在打开试玩…</p>)
  void import('@/pages/IELTSReadingMatch').then(({ PublicReadingMatchDemo }) => {
    root.render(<StrictMode><BrowserRouter><PublicReadingMatchDemo /></BrowserRouter></StrictMode>)
  }).catch(() => {
    root.render(<div className="p-6" role="alert">试玩加载失败。 <button className="underline" onClick={() => window.location.reload()}>刷新重试</button></div>)
  })
} else {
  root.render(<StrictMode><AppInitializer onPageReady={registerOfflineSupport} /></StrictMode>)
}
