import type { ReactNode } from 'react'

interface QuietEmptyStateProps { title: string; description: string; action?: ReactNode }

export function QuietEmptyState({ title, description, action }: QuietEmptyStateProps) {
  return <section className="quiet-surface grid min-h-72 place-items-center px-6 py-12 text-center"><div className="max-w-md"><span className="mx-auto mb-5 block h-px w-12 bg-[var(--app-alert)]" /><h2 className="quiet-display text-3xl">{title}</h2><p className="mt-3 text-sm leading-7 text-[var(--app-muted)]">{description}</p>{action && <div className="mt-6 flex justify-center">{action}</div>}</div></section>
}
