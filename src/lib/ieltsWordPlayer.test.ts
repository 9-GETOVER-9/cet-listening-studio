import { afterEach, expect, it, vi } from 'vitest'
import { IELTSWordPlayer } from './ieltsWordPlayer'
class AudioStub {
 src=''; currentTime=0; playbackRate=1; preservesPitch=false
 onended:(()=>void)|null=null; onerror:(()=>void)|null=null
 play=vi.fn(async()=>{}); pause=vi.fn(); load=vi.fn()
}
afterEach(()=>vi.useRealTimers())
it('plays only selected words bilingually and retains a paused gap', async()=>{
 vi.useFakeTimers(); const a=new AudioStub(), p=new IELTSWordPlayer(a as unknown as HTMLAudioElement,vi.fn())
 p.setQueue([{audio:'en1',chineseAudio:'zh1'},{audio:'en2',chineseAudio:'zh2'}]); await p.play()
 a.onended?.(); await vi.advanceTimersByTimeAsync(1000); p.pause()
 await vi.advanceTimersByTimeAsync(6000); expect(a.src).toBe('en1'); await p.play()
 await vi.advanceTimersByTimeAsync(1499); expect(a.src).toBe('en1')
 await vi.advanceTimersByTimeAsync(1); expect(a.src).toBe('zh1')
 a.onended?.(); await vi.advanceTimersByTimeAsync(800); expect(a.src).toBe('en2'); p.dispose()
})
it('invalidates timers and callbacks on switching and disposing',async()=>{
 vi.useFakeTimers(); const a=new AudioStub(),update=vi.fn(),p=new IELTSWordPlayer(a as unknown as HTMLAudioElement,update)
 p.setQueue([{audio:'old',chineseAudio:'old-zh'}]); await p.play(); const oldEnd=a.onended
 oldEnd?.(); p.setQueue([{audio:'new'}]); oldEnd?.(); await vi.advanceTimersByTimeAsync(5000)
 expect(a.src).toBe('new'); expect(update.mock.calls.at(-1)?.[0].playing).toBe(false)
 await p.play(); a.onended?.(); p.dispose(); await vi.advanceTimersByTimeAsync(5000); expect(a.onended).toBeNull()
})
it('stops at a failed word and retries it rather than skipping',async()=>{
 const a=new AudioStub(),update=vi.fn(),p=new IELTSWordPlayer(a as unknown as HTMLAudioElement,update)
 p.setQueue([{audio:'one'},{audio:'two'}]); a.play.mockRejectedValueOnce(new Error('failed')); await p.play()
 expect(a.src).toBe('one'); expect(update.mock.calls.at(-1)?.[0]).toMatchObject({playing:false,index:0})
 expect(update.mock.calls.at(-1)?.[0].error).toBeTruthy(); await p.play(); expect(a.src).toBe('one'); p.dispose()
})
it('stale successful play cannot restart a paused new queue',async()=>{
 const a=new AudioStub(),p=new IELTSWordPlayer(a as unknown as HTMLAudioElement,vi.fn())
 let done!:()=>void
 a.play.mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve}))
 p.setQueue([{audio:'old'}]);const pending=p.play();p.setQueue([{audio:'new'}]);const calls=a.pause.mock.calls.length
 done();await pending;expect(a.pause.mock.calls.length).toBeGreaterThan(calls);p.dispose()
})
it('reloads the same phase when retrying a media error',async()=>{
 const a=new AudioStub(),p=new IELTSWordPlayer(a as unknown as HTMLAudioElement,vi.fn())
 p.setQueue([{audio:'one'},{audio:'two'}]);await p.play();a.onended=null;a.onerror?.();const before=a.load.mock.calls.length
 await p.play();expect(a.src).toBe('one');expect(a.load.mock.calls.length).toBeGreaterThan(before);p.dispose()
})
it('scales remaining gap with speed and stops after last word without loop',async()=>{
 vi.useFakeTimers(); const a=new AudioStub(),update=vi.fn(),p=new IELTSWordPlayer(a as unknown as HTMLAudioElement,update)
 p.setQueue([{audio:'en',chineseAudio:'zh'}]); p.loop=false; await p.play(); a.onended?.()
 await vi.advanceTimersByTimeAsync(500); p.setRate(1.25); await vi.advanceTimersByTimeAsync(1600); expect(a.src).toBe('zh')
 a.onended?.(); await vi.advanceTimersByTimeAsync(640); expect(update.mock.calls.at(-1)?.[0].playing).toBe(false)
 expect(()=>p.setRate(2)).toThrow(); p.dispose()
})
