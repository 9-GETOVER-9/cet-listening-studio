export type RatingActivationEvent = 'click' | 'pointerdown'

export function shouldActivateRating(eventType: RatingActivationEvent): boolean {
  return eventType === 'click'
}
