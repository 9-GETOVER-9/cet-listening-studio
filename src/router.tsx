import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthGuard } from '@/components/AuthGuard'

const Home = lazy(() => import('@/pages/Home'))
const Login = lazy(() => import('@/pages/Login'))
const ContentSelector = lazy(() => import('@/pages/ContentSelector'))
const NCESelector = lazy(() => import('@/pages/NCESelector'))
const CardFlash = lazy(() => import('@/pages/CardFlash'))
const Notebook = lazy(() => import('@/pages/Notebook'))
const Profile = lazy(() => import('@/pages/Profile'))
const Feedback = lazy(() => import('@/pages/Feedback'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'cet', element: <ContentSelector /> },
      { path: 'nce', element: <NCESelector /> },
      { path: 'card/:moduleId', element: <CardFlash /> },
      { path: 'notebook', element: <Notebook /> },
      { path: 'notebook/review/:type', element: <Notebook /> },
      { path: 'profile', element: <Profile /> },
      { path: 'feedback', element: <Feedback /> },
    ],
  },
])
