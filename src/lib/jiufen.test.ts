import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { loadJiufenLibrary, updateJiufenLibrary } from './jiufenRepository'
import { jiufenAssetUrls } from './jiufenTypes'
describe('Jiufen asset loading', () => {
 it('cache-busts the shared sync engine so deployed fixes replace an older browser module', () => {
  expect(jiufenAssetUrls.sync).toMatch(/jiufen-sync\.mjs\?v=[a-f0-9]{64}$/)
 })
})
describe('Jiufen private library', () => {
 it('isolates accounts and source owners while applying changes to latest state', async () => {
  await updateJiufenLibrary('a','s', l => ({...l, cards:[{key:'one'}]}))
  await updateJiufenLibrary('a','s', l => ({...l, questionNotes:{q:{content:'draft'}}}))
  expect((await loadJiufenLibrary('a','s')).cards).toHaveLength(1)
  expect((await loadJiufenLibrary('a','s')).questionNotes).toEqual({q:{content:'draft'}})
  expect((await loadJiufenLibrary('b','s')).cards).toEqual([])
  expect((await loadJiufenLibrary('a','other')).cards).toEqual([])
 })
 it('serializes concurrent mutations without losing one', async () => {
  await Promise.all(['x','y'].map(key => updateJiufenLibrary('race','s', l => ({...l, cards:[...l.cards,{key}]}))))
  expect((await loadJiufenLibrary('race','s')).cards.map(c=>c.key).sort()).toEqual(['x','y'])
 })
})
import {pathToFileURL} from 'node:url'
import type {JiufenCore} from './jiufenTypes'
import {applyJiufenRating,advanceJiufenReview} from './jiufenRepository'
const coreUrl=pathToFileURL(process.cwd()+'/public/assets/jiufen/review-core.mjs').href
const pinned=await import(/* @vite-ignore */ coreUrl)
describe('Pinned desktop FSRS grading in atomic web storage',()=>{
 it('matches desktop scheduling, rejects repeated score and preserves other fields',async()=>{
  const card={key:'grade-card',title:'test',sentences:[{index:'1',text:'An answer.'}],clip:{url:'https://example.org/audio.mp3',start:1,end:4},memory:pinned.newMemory(),history:[]}
  const session=pinned.createSession([card],null);session.occurrence.played=true
  await updateJiufenLibrary('grade','source',()=>({cards:[card],questionNotes:{q:{content:'keep'}},session}))
  const before=Date.now()
  const saved=await updateJiufenLibrary('grade','source',l=>applyJiufenRating(l,pinned as JiufenCore,card.key,session.occurrence.id,'good'))
  const expected=pinned.assessSentence(card,session,'good',{now:Date.parse((saved.cards[0].history![0] as {at:string}).at)})
  expect(saved.cards[0]).toEqual(expected.card)
  expect(Date.parse((saved.cards[0].history![0] as {at:string}).at)).toBeGreaterThanOrEqual(before)
  expect(saved.questionNotes.q.content).toBe('keep')
  await expect(updateJiufenLibrary('grade','source',l=>applyJiufenRating(l,pinned as JiufenCore,card.key,session.occurrence.id,'easy'))).rejects.toThrow()
  expect((await loadJiufenLibrary('grade','source')).cards[0].history).toHaveLength(1)
  const next=advanceJiufenReview(saved,pinned as JiufenCore)
  expect(next.session?.occurrence.grade).toBeNull()
 })
 it('pulls a fresh desktop library through the real Dexie commit adapter',async()=>{
  const syncUrl=pathToFileURL(process.cwd()+'/public/assets/jiufen/jiufen-sync.mjs').href
  const shared=await import(/* @vite-ignore */ syncUrl)
  const card={key:'pull-card',source:{questionIds:['q1']},sentences:[{index:'1',text:'hello'}],memory:pinned.newMemory(),history:[]}
  const records=[...shared.collectJiufenRecords('desktop',{cards:[card],questionNotes:{q1:{content:'note'}}})].map(([key,value]:[string,unknown],i:number)=>({key,value,version:i+1}))
  const engine=shared.createJiufenSync({sourceOwner:'desktop',load:()=>loadJiufenLibrary('pull','desktop'),commit:async(meta:unknown,updates:unknown)=>{await updateJiufenLibrary('pull','desktop',l=>shared.applyJiufenCommit(l,meta,updates))},exchange:async()=>({acks:[],records,cursor:records.length,more:false})})
  await engine.run()
  const result=await loadJiufenLibrary('pull','desktop')
  expect(result.cards[0].memory).toEqual(card.memory)
  expect(result.questionNotes.q1.content).toBe('note')
  expect(Object.values((result.bridgeSync?.records??{}) as Record<string,{conflict?:unknown}>).some(r=>r.conflict)).toBe(false)
  engine.dispose()
 })
})
import {jiufenLoginReturn} from './jiufenLogin'
describe('private pairing login return',()=>{it('keeps pairing query while rejecting external or unrelated redirects',()=>{
 expect(jiufenLoginReturn('/jiufen?pair=ABC')).toBe('/jiufen?pair=ABC')
 expect(jiufenLoginReturn('https://example.org')).toBe('/')
 expect(jiufenLoginReturn('//example.org')).toBe('/')
 expect(jiufenLoginReturn('/jiufen-other')).toBe('/')
})})
import {vi} from 'vitest'
import {createSegmentPlayback} from './jiufenAudio'
describe('whole clip loop lifecycle',()=>{
 it('pauses at clip end, waits three seconds, and cancels pending replay on pause or disposal',async()=>{
  vi.useFakeTimers()
  const player=Object.assign(new EventTarget(),{currentTime:2,playbackRate:1,paused:true,play:vi.fn(async()=>{player.paused=false;player.dispatchEvent(new Event('playing'))}),pause:vi.fn(()=>{player.paused=true;player.dispatchEvent(new Event('pause'))})})
  const controls=createSegmentPlayback(player,{start:2,end:5})
  controls.setLoop(true);await controls.play()
  player.currentTime=5;player.dispatchEvent(new Event('timeupdate'))
  expect(player.paused).toBe(true)
  player.dispatchEvent(new Event('pause')) // Native pause events may arrive after finish schedules the gap.
  await vi.advanceTimersByTimeAsync(2999);expect(player.play).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1);expect(player.currentTime).toBe(2);expect(player.play).toHaveBeenCalledTimes(2)
  player.currentTime=5;player.dispatchEvent(new Event('timeupdate'));controls.pause()
  await vi.advanceTimersByTimeAsync(3000);expect(player.play).toHaveBeenCalledTimes(2)
  await controls.play();player.currentTime=5;player.dispatchEvent(new Event('timeupdate'));controls.setLoop(false)
  await vi.advanceTimersByTimeAsync(3000);expect(player.play).toHaveBeenCalledTimes(3)
  controls.setLoop(true);await controls.play();player.currentTime=5;player.dispatchEvent(new Event('timeupdate'));controls.dispose()
  await vi.advanceTimersByTimeAsync(3000);expect(player.play).toHaveBeenCalledTimes(4)
  vi.useRealTimers()
 })
 it('resumes valid positions and restarts only explicitly, with timer boundary when no RAF runs',async()=>{
  vi.useFakeTimers()
  const player=Object.assign(new EventTarget(),{currentTime:3,playbackRate:1,paused:true,play:vi.fn(async()=>{player.paused=false;player.dispatchEvent(new Event('playing'))}),pause:vi.fn(()=>{player.paused=true;player.dispatchEvent(new Event('pause'))})})
  const controls=createSegmentPlayback(player,{start:2,end:5})
  await controls.play();expect(player.currentTime).toBe(3)
  controls.pause();await controls.play(true);expect(player.currentTime).toBe(2)
  player.currentTime=5;await vi.advanceTimersByTimeAsync(3000);expect(player.paused).toBe(true)
  controls.dispose();vi.useRealTimers()
 })
})
it('keeps both note versions when a remote update arrives during active editing',async()=>{
 const syncUrl=pathToFileURL(process.cwd()+'/public/assets/jiufen/jiufen-sync.mjs').href
 const shared=await import(/* @vite-ignore */ syncUrl)
 const key='jiufen/edit-source/note/q-edit',card={key:'edit-card',source:{questionIds:['q-edit']}}
 await updateJiufenLibrary('edit-account','edit-source',()=>({cards:[card],questionNotes:{'q-edit':{content:'original'}}}))
 await updateJiufenLibrary('edit-account','edit-source',l=>shared.applyJiufenCommit(l,{records:{[key]:{version:2,remote:{content:'remote'},observed:{content:'original'}}}},[{key,value:{content:'remote'},expected:{content:'original'}}],{deferKeys:[key]}))
 expect((await loadJiufenLibrary('edit-account','edit-source')).questionNotes['q-edit'].content).toBe('original')
 await updateJiufenLibrary('edit-account','edit-source',l=>({...l,questionNotes:{'q-edit':{content:'original plus local draft'}}}))
 const continued=await updateJiufenLibrary('edit-account','edit-source',l=>shared.applyJiufenIncoming(l))
 const records=continued.bridgeSync?.records as Record<string,{conflict:{local:{content:string};remote:{content:string}}}>
 expect(records[key].conflict.local.content).toBe('original plus local draft')
 expect(records[key].conflict.remote.content).toBe('remote')
 expect(continued.questionNotes['q-edit'].content).toBe('original plus local draft')
})
import {createSegmentResourceGuard} from './jiufenAudio'
it('latches invalid audio metadata until a new resource guard is created',()=>{
 const resource=createSegmentResourceGuard({start:2,end:10})
 expect(resource.canPlay()).toBe(false)
 expect(resource.validate(7)).toBe(false)
 expect(resource.canPlay()).toBe(false)
 expect(resource.validate(20)).toBe(false)
 const replacement=createSegmentResourceGuard({start:2,end:5})
 expect(replacement.validate(7)).toBe(true)
 expect(replacement.canPlay()).toBe(true)
})
import {createJiufenLifecycle} from './jiufenLifecycle'
it('keeps cancelled async setup inert across a fresh effect generation',async()=>{
 const first=createJiufenLifecycle(),second=createJiufenLifecycle(),disposeOld=vi.fn(),disposeNew=vi.fn()
 first.own(disposeOld);first.cancel();second.own(disposeNew)
 const delayedOldTimerCleanup=vi.fn();first.own(delayedOldTimerCleanup)
 expect(first.active()).toBe(false);expect(second.active()).toBe(true)
 expect(disposeOld).toHaveBeenCalledTimes(1);expect(delayedOldTimerCleanup).toHaveBeenCalledTimes(1);expect(disposeNew).not.toHaveBeenCalled()
 second.cancel();expect(disposeNew).toHaveBeenCalledTimes(1)
})
