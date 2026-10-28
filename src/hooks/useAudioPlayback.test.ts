/* eslint-disable react-hooks/rules-of-hooks -- Tests drive useAudio with the persistent mocked hook runtime below. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAudio } from './useAudio'
const hooks=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effects:[] as (()=>void)[],cleanups:[] as (()=>void)[]}));
vi.mock('react',async importOriginal=>{
 const actual=await importOriginal<typeof import('react')>();
 function memo<T>(value:()=>T,deps:unknown[]) {
  const index=hooks.cursor++;const prior=hooks.slots[index] as {value:T;deps:unknown[]}|undefined;
  if(prior && deps.every((dep,i)=>Object.is(dep,prior.deps[i])))return prior.value;
  const next=value();hooks.slots[index]={value:next,deps};return next;
 }
 return {...actual,
  useState:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.slots))hooks.slots[index]=typeof initial==='function'?(initial as ()=>unknown)():initial;return [hooks.slots[index],(next:unknown)=>{hooks.slots[index]=typeof next==='function'?(next as (prior:unknown)=>unknown)(hooks.slots[index]):next}]},
  useRef:(value:unknown)=>memo(()=>({current:value}),[]),
  useCallback:(fn:unknown,deps:unknown[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>void|(()=>void),deps:unknown[])=>{memo(()=>{hooks.effects.push(()=>{const cleanup=fn();if(cleanup)hooks.cleanups.push(cleanup)});return null},deps)},
 };
});

vi.mock('@/lib/audioTimeTracker',()=>({getListeningOwner:()=>null,AudioTimeTracker:class {setCategory(){} checkpoint(){} dispose(){}}}));
class Media extends EventTarget {
  src=''; currentTime=0; paused=true; ended=false;
  play=vi.fn(async()=>{this.paused=false}); pause(){this.paused=true}; load(){}
}
let media: Media;
function render(file='one.mp3'){hooks.cursor=0;const result=useAudio(file);hooks.effects.splice(0).forEach(effect=>effect());return result}
async function settle(){for(let i=0;i<6;i++)await Promise.resolve()}
beforeEach(()=>{hooks.slots=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];media=new Media();vi.stubGlobal('Audio',class{constructor(){return media}})});
afterEach(()=>{hooks.cleanups.splice(0).forEach(cleanup=>cleanup());vi.useRealTimers();vi.unstubAllGlobals()});
it('does not mistake buffered media for audible playback',async()=>{
 render().play();media.dispatchEvent(new Event('canplay'));expect(render().playState).toBe('loading');
 media.dispatchEvent(new Event('playing'));expect(render().playState).toBe('playing');
});
it('makes hung loading retryable instead of leaving the button disabled forever',async()=>{
 vi.useFakeTimers();media.play=vi.fn(()=>new Promise<void>(()=>{}));render().play();
 await vi.advanceTimersByTimeAsync(15000);expect(render().playState).toBe('error');
 render().play();expect(media.play).toHaveBeenCalledTimes(2);
});
it('catches a rejected resume and shows a retry state',async()=>{
 render().play();await settle();render().pause();
 media.play=vi.fn().mockRejectedValue(new Error('permission denied'));
 render().resume();await settle();expect(render().playState).toBe('error');
});
it('stops a merged sentence at the failed segment instead of silently skipping it',async()=>{
 vi.useFakeTimers();media.play=vi.fn().mockRejectedValue(new Error('offline'));
 render().playMultiple(['one.mp3','two.mp3']);await vi.advanceTimersByTimeAsync(100);
 expect(render().playState).toBe('error');expect(media.play).toHaveBeenCalledTimes(1);
});

it('keeps the new loading watchdog when an old request rejects late',async()=>{
 vi.useFakeTimers();let rejectOld!:(err:Error)=>void;
 media.play=vi.fn().mockImplementationOnce(()=>new Promise<void>((_,reject)=>{rejectOld=reject})).mockImplementation(()=>new Promise<void>(()=>{}));
 render().play();render().play();rejectOld(new Error('old interruption'));
 await vi.advanceTimersByTimeAsync(15000);expect(render().playState).toBe('error');
});
it('shows an interrupted browser pause and can resume from a new tap',async()=>{
 render().play();media.dispatchEvent(new Event('playing'));media.pause();media.dispatchEvent(new Event('pause'));
 expect(render().playState).toBe('paused');render().resume();media.dispatchEvent(new Event('playing'));
 expect(render().playState).toBe('playing');
});
it('times out a mid-play buffer stall without timing out a deliberate pause',async()=>{
 vi.useFakeTimers();render().play();media.dispatchEvent(new Event('playing'));
 media.dispatchEvent(new Event('waiting'));await vi.advanceTimersByTimeAsync(15000);
 expect(render().playState).toBe('error');render().play();render().pause();
 await vi.advanceTimersByTimeAsync(15000);expect(render().playState).toBe('paused');
});

it('clears a loading state when switching to another card',()=>{
 render().play();expect(render().playState).toBe('loading');
 hooks.cleanups[0]();expect(render('two.mp3').playState).toBe('idle');
});
