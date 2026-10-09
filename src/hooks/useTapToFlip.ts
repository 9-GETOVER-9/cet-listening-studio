import { useCallback, useMemo, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

interface UseTapToFlipOptions {
  disabled?: boolean
  moveThreshold?: number
  onTap: () => void
}

interface PointerGesture {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  startedOnInteractive: boolean
}

const DEFAULT_MOVE_THRESHOLD = 12
const POST_TAP_CLICK_GUARD_MS = 350

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('button, input, textarea, select, a, [data-interactive]'),
  )
}

export function useTapToFlip({
  disabled = false,
  moveThreshold = DEFAULT_MOVE_THRESHOLD,
  onTap,
}: UseTapToFlipOptions) {
  const gestureRef = useRef<PointerGesture | null>(null)
  const suppressUntilRef = useRef(0)

  const suppressTap = useCallback((durationMs = 650) => {
    suppressUntilRef.current = Math.max(suppressUntilRef.current, Date.now() + durationMs)
  }, [])

  const isSuppressed = useCallback(() => Date.now() < suppressUntilRef.current, [])

  const handleTap = useCallback(() => {
    suppressTap(POST_TAP_CLICK_GUARD_MS)
    onTap()
  }, [onTap, suppressTap])

  return useMemo(() => ({
    handlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (disabled) return
        if (event.pointerType === 'mouse' && event.button !== 0) return

        gestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          startedOnInteractive: isInteractiveTarget(event.target),
        }
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current
        if (!gesture || gesture.pointerId !== event.pointerId) return

        const movedX = Math.abs(event.clientX - gesture.startX)
        const movedY = Math.abs(event.clientY - gesture.startY)
        if (movedX > moveThreshold || movedY > moveThreshold) {
          gesture.moved = true
        }
      },
      onPointerCancel: () => {
        gestureRef.current = null
        suppressTap(POST_TAP_CLICK_GUARD_MS)
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current
        gestureRef.current = null

        if (disabled || !gesture) return
        if (gesture.pointerId !== event.pointerId) return
        if (gesture.moved || gesture.startedOnInteractive) return
        if (isInteractiveTarget(event.target) || isSuppressed()) return

        handleTap()
      },
      onClick: (event: ReactMouseEvent<HTMLElement>) => {
        if (disabled) return
        if (isInteractiveTarget(event.target) || isSuppressed()) return

        handleTap()
      },
    },
    suppressTap,
  }), [disabled, handleTap, isSuppressed, moveThreshold, suppressTap])
}
