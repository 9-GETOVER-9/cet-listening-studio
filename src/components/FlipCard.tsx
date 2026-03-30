import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FlipCardProps {
  front: React.ReactNode
  back: React.ReactNode
  isFlipped: boolean
  onFlip?: () => void
  className?: string
}

/**
 * 卡片翻转组件
 * 使用 framer-motion 实现 3D 翻转动画
 */
export function FlipCard({
  front,
  back,
  isFlipped,
  onFlip,
  className,
}: FlipCardProps) {
  return (
    <div
      className={cn('relative w-full cursor-pointer', className)}
      style={{ perspective: 1000 }}
      onClick={onFlip}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!isFlipped ? (
          <motion.div
            key="front"
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{
              backfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
            }}
            className="w-full"
          >
            {front}
          </motion.div>
        ) : (
          <motion.div
            key="back"
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{
              backfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
            }}
            className="w-full"
          >
            {back}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
