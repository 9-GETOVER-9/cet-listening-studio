import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand text-white",
        secondary: "border-transparent bg-gray-100 text-gray-900",
        success: "border-transparent bg-green-500 text-white",
        warning: "border-transparent bg-yellow-500 text-white",
        destructive: "border-transparent bg-red-500 text-white",
        outline: "text-gray-900 border-gray-200",
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
