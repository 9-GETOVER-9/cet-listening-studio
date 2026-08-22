import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--app-radius)] border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--app-accent)] text-white",
        secondary: "border-transparent bg-[var(--app-accent-soft)] text-[var(--app-ink)]",
        success: "border-transparent bg-green-500 text-white",
        warning: "border-transparent bg-yellow-500 text-white",
        destructive: "border-transparent bg-red-500 text-white",
        outline: "border-[var(--app-line)] text-[var(--app-ink)]",
        // 难度标签
        basic: "border-transparent bg-green-100 text-green-800",
        medium: "border-transparent bg-blue-100 text-blue-800",
        hard: "border-transparent bg-orange-100 text-orange-800",
        advanced: "border-transparent bg-red-100 text-red-800",
        // 发音现象标签
        连读: "border-transparent bg-blue-100 text-blue-800",
        弱读: "border-transparent bg-purple-100 text-purple-800",
        失爆: "border-transparent bg-orange-100 text-orange-800",
        同化: "border-transparent bg-green-100 text-green-800",
        侵入音: "border-transparent bg-pink-100 text-pink-800",
        // 状态标签
        learned: "border-transparent bg-green-100 text-green-800",
        incomplete: "border-transparent bg-orange-100 text-orange-800",
        not_started: "border-transparent bg-gray-100 text-gray-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
