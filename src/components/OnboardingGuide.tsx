import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, ChevronRight, Headphones, BookOpen, Star, Zap } from 'lucide-react'

interface OnboardingGuideProps {
  onComplete: () => void
}

const STEPS = [
  {
    icon: Headphones,
    title: '四六级听力',
    description: '历年真题，AI 解析，FSRS 科学复习。支持按考试日期、Section、题型选择。',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: BookOpen,
    title: '新概念英语',
    description: 'Book 1-4 系统课程，从基础到进阶。免费学习 Book 1 & 2，开通 PRO 解锁全部内容。',
    color: 'bg-purple-100 text-purple-600',
  },
  {
    icon: Star,
    title: '难点收藏',
    description: '一键收藏短语、单词、发音现象到难点本，随时复习巩固。',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    icon: Zap,
    title: '科学复习',
    description: '基于 FSRS 算法，根据记忆曲线智能安排复习时间，让学习更高效。',
    color: 'bg-green-100 text-green-600',
  },
]

/**
 * 首次加载引导组件
 * 展示四个步骤，帮助用户快速了解应用功能
 */
export function OnboardingGuide({ onComplete }: OnboardingGuideProps) {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    }
  }

  const handleComplete = () => {
    onComplete()
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleStartLearning = () => {
    handleComplete()
    navigate('/cet')
  }

  const current = STEPS[currentStep]
  const Icon = current.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50/95 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md px-4"
        >
          <Card className="shadow-xl">
            <CardContent className="p-6">
              {/* 跳过按钮 */}
              <div className="mb-6 flex justify-end">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
                >
                  <span>跳过</span>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 图标 */}
              <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${current.color}`}>
                <Icon className="h-10 w-10" />
              </div>

              {/* 内容 */}
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">{current.title}</h2>
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                  {current.description}
                </p>
              </div>

              {/* 步骤指示器 */}
              <div className="mt-8 flex justify-center gap-2">
                {STEPS.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 rounded-full transition-all ${
                      index === currentStep
                        ? 'w-6 bg-brand'
                        : index < currentStep
                        ? 'w-2 bg-brand'
                        : 'w-2 bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              {/* 按钮 */}
              <div className="mt-6 flex flex-col gap-3">
                {currentStep === STEPS.length - 1 ? (
                  <>
                    <Button onClick={handleStartLearning} className="w-full">
                      开始学习
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={handleSkip} className="w-full">
                      稍后再说
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={handleNext} className="w-full">
                      下一页
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={handleSkip} className="w-full">
                      跳过引导
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
