import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthGuard } from '@/components/AuthGuard'
import { RouteErrorFallback } from '@/components/RouteErrorFallback'
import { lazyWithRecovery } from '@/lib/lazyWithRecovery'

const Home = lazyWithRecovery(() => import('@/pages/Home'))
const Login = lazyWithRecovery(() => import('@/pages/Login'))
const ContentSelector = lazyWithRecovery(() => import('@/pages/ContentSelector'))
const NCESelector = lazyWithRecovery(() => import('@/pages/NCESelector'))
const IELTSDictation = lazyWithRecovery(() => import('@/pages/IELTSDictation'))
const CardFlash = lazyWithRecovery(() => import('@/pages/CardFlash'))
const Review = lazyWithRecovery(() => import('@/pages/Review'))
const Walkman = lazyWithRecovery(() => import('@/pages/Walkman'))
const Notebook = lazyWithRecovery(() => import('@/pages/Notebook'))
const Profile = lazyWithRecovery(() => import('@/pages/Profile'))
const LearningStats = lazyWithRecovery(() => import('@/pages/LearningStats'))
const Feedback = lazyWithRecovery(() => import('@/pages/Feedback'))
const Admin = lazyWithRecovery(() => import('@/pages/Admin'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/admin-9x7k',
    element: <Admin />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/',
    errorElement: <RouteErrorFallback />,
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'cet', element: <ContentSelector /> },
      { path: 'nce', element: <NCESelector /> },
      { path: 'ielts', element: <IELTSDictation /> },
      { path: 'card/:moduleId', element: <CardFlash /> },
      { path: 'review', element: <Review /> },
      { path: 'walkman', element: <Walkman /> },
      { path: 'notebook', element: <Notebook /> },
      { path: 'notebook/review/:type', element: <Notebook /> },
      { path: 'profile', element: <Profile /> },
      { path: 'profile/stats', element: <LearningStats /> },
      { path: 'feedback', element: <Feedback /> },
    ],
  },
])
