export const THEMES = ['classic', 'quiet-studio'] as const

export type AppTheme = (typeof THEMES)[number]

// Change this value and publish to change the theme for every user.
export const ACTIVE_THEME: AppTheme = 'quiet-studio'

export function applyAppTheme(theme: AppTheme = ACTIVE_THEME) {
  document.documentElement.dataset.theme = theme
}
