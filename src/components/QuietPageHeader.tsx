import type { ReactNode } from 'react'

interface QuietPageHeaderProps { eyebrow: string; title: ReactNode; description?: ReactNode; stamp?: ReactNode; actions?: ReactNode }

export function QuietPageHeader({ eyebrow, title, description, stamp, actions }: QuietPageHeaderProps) {
  return (
    <header className="mb-10 flex items-start justify-between gap-6 md:mb-12">
      <div><p className="quiet-kicker mb-2">{eyebrow}</p><h1 className="quiet-display text-[clamp(2.6rem,6vw,4.25rem)]">{title}</h1>{description && <div className="mt-4 max-w-2xl text-sm leading-7 text-[var(--app-muted)]">{description}</div>}{actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}</div>
      {stamp && <div className="hidden min-w-20 border-t border-[var(--app-ink)] pt-2 font-serif text-xs leading-5 text-[var(--app-muted)] sm:block">{stamp}</div>}
    </header>
  )
}
