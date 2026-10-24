import type { ReactNode } from 'react'

interface QuietPageHeaderProps { eyebrow: string; title: ReactNode; description?: ReactNode; stamp?: ReactNode; actions?: ReactNode }

export function QuietPageHeader({ eyebrow, title, description, stamp, actions }: QuietPageHeaderProps) {
  return (
    <header className="mb-7 flex items-start justify-between gap-6 md:mb-9">
      <div className="min-w-0"><p className="quiet-kicker mb-2">{eyebrow}</p><h1 className="quiet-display text-[clamp(2rem,4vw,3.25rem)]">{title}</h1>{description && <div className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{description}</div>}{actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}</div>
      {stamp && <div className="hidden min-w-20 border-t border-[var(--app-ink)] pt-2 font-serif text-xs leading-5 text-[var(--app-muted)] sm:block">{stamp}</div>}
    </header>
  )
}
