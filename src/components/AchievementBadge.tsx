import { motion } from 'framer-motion'
import { Award, Flame, Target, Trophy, Zap, type LucideIcon } from 'lucide-react'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: 'target' | 'flame' | 'trophy' | 'award' | 'zap'
  unlocked: boolean
  progress: number
  target: number
  unlockedAt?: string
}

const iconMap: Record<Achievement['icon'], LucideIcon> = {
  target: Target,
  flame: Flame,
  trophy: Trophy,
  award: Award,
  zap: Zap,
}

export function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const Icon = iconMap[achievement.icon]
  const progressPercent = Math.min(100, Math.round((achievement.progress / achievement.target) * 100))

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.03 }}
      className={`
        relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors
        ${achievement.unlocked
          ? 'border-yellow-400 bg-yellow-50 shadow-sm'
          : 'border-gray-200 bg-gray-50'
        }
      `}
    >
      {/* 解锁标记 */}
      {achievement.unlocked && (
        <span className="absolute -right-1 -top-1 text-lg" aria-hidden>
          ✅
        </span>
      )}

      {/* 图标 */}
      <div
        className={`rounded-full p-2.5 ${
          achievement.unlocked
            ? 'bg-yellow-100 text-yellow-600'
            : 'bg-gray-200 text-gray-400'
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>

      {/* 名称与描述 */}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">
          {achievement.name}
        </p>
        <p className="text-xs text-gray-500">
          {achievement.description}
        </p>
      </div>

      {/* 进度条 */}
      {!achievement.unlocked && (
        <div className="w-full">
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-400">
            {achievement.progress}/{achievement.target}
          </p>
        </div>
      )}

      {/* 解锁时间 */}
      {achievement.unlocked && achievement.unlockedAt && (
        <p className="text-xs text-gray-400">
          {achievement.unlockedAt}
        </p>
      )}
    </motion.div>
  )
}

export function AchievementGrid({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {achievements.map((a) => (
        <AchievementBadge key={a.id} achievement={a} />
      ))}
    </div>
  )
}
