import { isValidElement } from 'react'
import { createBrowserRouter, matchRoutes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthGuard } from '@/components/AuthGuard'
import { RouteErrorFallback } from '@/components/RouteErrorFallback'
import { lazyWithRecovery } from '@/lib/lazyWithRecovery'

const Courses = lazyWithRecovery(() => import('@/pages/Courses'))
const Home = lazyWithRecovery(() => import('@/pages/Home'))
const Login = lazyWithRecovery(() => import('@/pages/Login'))
const ContentSelector = lazyWithRecovery(() => import('@/pages/ContentSelector'))
const NCESelector = lazyWithRecovery(() => import('@/pages/NCESelector'))
const IELTSDictation = lazyWithRecovery(() => import('@/pages/IELTSDictation'))
const IELTSHub = lazyWithRecovery(() => import('@/pages/IELTSHub'))
const IELTSReading = lazyWithRecovery(() => import('@/pages/IELTSReading'))
const CardFlash = lazyWithRecovery(() => import('@/pages/CardFlash'))
const ReviewHub = lazyWithRecovery(() => import('@/pages/ReviewHub'))
const Review = lazyWithRecovery(() => import('@/pages/Review'))
const Walkman = lazyWithRecovery(() => import('@/pages/Walkman'))
const Notebook = lazyWithRecovery(() => import('@/pages/Notebook'))
const WordPractice = lazyWithRecovery(() => import('@/pages/WordPractice'))
const NCEShadowing = lazyWithRecovery(() => import('@/pages/NCEShadowing'))
const Jiufen = lazyWithRecovery(() => import('@/pages/Jiufen'))
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
      { path: 'courses', element: <Courses /> },
      { path: 'cet', element: <ContentSelector /> },
      { path: 'nce', element: <NCESelector /> },
      { path: 'nce/shadowing/:moduleId', element: <NCEShadowing /> },
      { path: 'ielts', element: <IELTSHub /> },
      { path: 'ielts/listening', element: <IELTSDictation /> },
      { path: 'ielts/reading-538', element: <IELTSReading /> },
      { path: 'card/:moduleId', element: <CardFlash /> },
      { path: 'review', element: <ReviewHub /> },
      { path: 'review/session', element: <Review /> },
      { path: 'walkman', element: <Walkman /> },
      { path: 'notebook', element: <Notebook /> },
      { path: 'word-practice', element: <WordPractice /> },
      { path: 'notebook/review/:type', element: <Notebook /> },
      { path: 'jiufen', element: <Jiufen /> },
      { path: 'profile', element: <Profile /> },
      { path: 'profile/stats', element: <LearningStats /> },
      { path: 'feedback', element: <Feedback /> },
    ],
  },
])

// Download only the URL's page while session/index reads are in flight.
// A failed speculative request is retried by lazyWithRecovery on actual render.
export const initialPageReady = typeof window === 'undefined' ? Promise.resolve() : Promise.all(
  (matchRoutes(router.routes, window.location.pathname) ?? []).map(({ route }) => {
    const element = route.element
    if (!isValidElement(element)) return
    const component: unknown = element.type
    if (typeof component === 'object' && component !== null && 'preload' in component && typeof component.preload === 'function') {
      return component.preload()
    }
  }),
).then(() => {}, () => {})
