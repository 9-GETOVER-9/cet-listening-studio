import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IELTSWordPlayer } from '@/lib/ieltsWordPlayer'
import type { IELTSCard } from '@/lib/ieltsDictation'
import type { PlayerState } from '@/lib/ieltsPlayer'
import { AudioTimeTracker } from '@/lib/audioTimeTracker'

export function IELTSWordWalkman({cards,rate,owner}:{cards:IELTSCard[];rate:number;owner:string}) {
 const audioRef=useRef<HTMLAudioElement>(null),playerRef=useRef<IELTSWordPlayer|null>(null)
 const [state,setState]=useState<PlayerState>({index:0,playing:false,error:''})
 const [loop,setLoop]=useState(true)
 useEffect(()=>{
  const audio=audioRef.current;if(!audio)return
  let tracker:AudioTimeTracker|null=null
  const player=new IELTSWordPlayer(audio,s=>{
   setState(s)
   tracker?.setCategory(cards[s.index]?.sourceBook==='frequency'?'frequency':'wanglu')
  })
  tracker=new AudioTimeTracker(audio,{owner,category:cards[0]?.sourceBook==='frequency'?'frequency':'wanglu'})
  playerRef.current=player;player.setQueue(cards)
  return()=>{player.dispose();tracker?.dispose();playerRef.current=null}
 },[cards,owner])
 useEffect(()=>{playerRef.current?.setRate(rate)},[rate,cards])
 useEffect(()=>{if(playerRef.current)playerRef.current.loop=loop},[loop,cards])
 const card=cards[state.index]
 return <section className="mt-6 border-t border-[var(--app-line)] pt-6" aria-label="逐词双语随身听">
  <audio ref={audioRef} preload="metadata"/>
  <p className="quiet-kicker">随身听 · {card?.chineseAudio?'英文 → 中文':'英文'}</p>
  <p className="mt-3 text-xl font-semibold">{card?.word??'先添加需要复习的词'}</p>
  <p className="mt-2 text-sm text-[var(--app-muted)]">{card?.chinese}</p>
  <p className="mt-2 text-sm">第 {cards.length?state.index+1:0} / {cards.length} 词{card?.chineseAudio?` · 中英间隔约 ${(2.5/rate).toFixed(1)} 秒 · ${card.chineseAudio.startsWith('/data/audio/ielts-zh/')?'甜美桃子 2.0':'已导入中文录音'}`:''}</p>
  {card&&!card.chineseAudio&&<p role="status" className="mt-2 text-sm">当前词暂无中文配音，将连续播放英文。</p>}
  <div className="my-5 flex flex-wrap gap-3">
   <Button variant="outline" disabled={!cards.length} onClick={()=>playerRef.current?.previous()}>上一词</Button>
   <Button disabled={!cards.length} onClick={()=>state.playing?playerRef.current?.pause():void playerRef.current?.play()}>{state.playing?'暂停随身听':'播放随身听'}</Button>
   <Button variant="outline" disabled={!cards.length} onClick={()=>playerRef.current?.next()}>下一词</Button>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>循环所选内容</label>
  </div>
  {state.error&&<p role="alert" className="text-red-600">{state.error}</p>}
 </section>
}
