export type SpeedControlledAudio = Pick<HTMLAudioElement, 'defaultPlaybackRate' | 'playbackRate'> & {
  preservesPitch?: boolean
  mozPreservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

export function applyAudioSpeed(audio: SpeedControlledAudio, newSpeed: number): void {
  audio.defaultPlaybackRate = newSpeed
  audio.playbackRate = newSpeed

  if ('preservesPitch' in audio) audio.preservesPitch = true
  if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true
  if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true
}
