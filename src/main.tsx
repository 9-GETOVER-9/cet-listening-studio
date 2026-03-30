import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppInitializer } from '@/components/AppInitializer'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppInitializer />
  </StrictMode>,
)
