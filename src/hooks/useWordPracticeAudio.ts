import { useEffect, useState } from 'react'
import { availablePracticeVoices, PracticeAudio, type PracticeAudioState } from '@/lib/wordPracticeAudio'
export function useWordPracticeAudio() {
  const [state, setState] = useState<PracticeAudioState>('idle')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [player] = useState(() => new PracticeAudio(undefined, setState))
  useEffect(() => {
    const synth = globalThis.speechSynthesis
    const update = () => setVoices(availablePracticeVoices(synth?.getVoices() || []))
    update(); synth?.addEventListener('voiceschanged', update)
    const stop = () => { if (document.hidden) player.stop() }
    document.addEventListener('visibilitychange', stop)
    return () => { synth?.removeEventListener('voiceschanged', update); document.removeEventListener('visibilitychange', stop); player.stop() }
  }, [player])
  return { player, state, voices }
}
