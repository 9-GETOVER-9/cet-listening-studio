import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AppInitializer } from '@/components/AppInitializer'
import { reloadForFreshChunks } from '@/lib/chunkRecovery'
import './index.css'

if ('caches' in window) {
  void caches.delete('audio-files')
  void caches.delete('workbox-audio-files')
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  void reloadForFreshChunks()
})

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppInitializer />
  </StrictMode>,
)
