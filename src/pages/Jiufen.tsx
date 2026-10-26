import {createJiufenLifecycle} from '@/lib/jiufenLifecycle'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Link,useSearchParams,useLocation} from 'react-router-dom'
import {useAuth} from '@/hooks/useAuth'
import {supabase} from '@/lib/supabase'
import {loadJiufenLibrary,updateJiufenLibrary,applyJiufenRating,advanceJiufenReview,activeJiufenDeferKeys} from '@/lib/jiufenRepository'
import {loadJiufenModules,type JiufenCore,type JiufenLibrary,type JiufenSyncEngine,type JiufenSyncModule} from '@/lib/jiufenTypes'
import {createSegmentPlayback,createSegmentResourceGuard} from '@/lib/jiufenAudio'

const button='rounded-xl border border-[var(--app-line)] px-4 py-2 text-sm disabled:opacity-40 hover:bg-[var(--app-paper-2)]'
const box='rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-4 sm:p-6'
interface Device {deviceId:string;sourceOwner:string;deviceName:string;revoked:boolean}
async function request(account:string,path:string,body:Record<string,unknown>={}){
 const {data:{session}}=await supabase.auth.getSession()
 if(!session||session.user.id!==account)throw Error('登录状态已变化，请重新打开此页')
 const response=await fetch('/api/jiufen/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)})
 const result=await response.json()
 if(!response.ok)throw Error(result.error??'同步请求失败')
 return result
}
export default function Jiufen(){
 const {user,session,loading}=useAuth()
 const location=useLocation()
 if(loading)return <div className="quiet-page">正在读取登录状态…</div>
 if(!user||!session||!user.email_confirmed_at)return <div className="quiet-page space-y-4"><h1 className="text-2xl font-serif">九分学长 · 私人复习</h1><p>请登录并确认邮箱，查看你自己的同步错题。</p><Link className={button} to={'/login?next='+encodeURIComponent(location.pathname+location.search)}>登录</Link></div>
 return <PrivateJiufen key={user.id} account={user.id}/>
}
function PrivateJiufen({account}:{account:string}){
 const [params,setParams]=useSearchParams()
 const [code,setCode]=useState(params.get('pair')??'')
 const [devices,setDevices]=useState<Device[]>([]),[source,setSource]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const alive=useRef(true),deviceGeneration=useRef(0)
 const refresh=useCallback(async()=>{const generation=++deviceGeneration.current;const data=await request(account,'devices');if(!alive.current||generation!==deviceGeneration.current)return;setDevices(data.devices);setSource(old=>old||data.devices[0]?.sourceOwner||'')},[account])
 useEffect(()=>{const lifecycle=createJiufenLifecycle();alive.current=true;void refresh().catch(e=>{if(lifecycle.active())setError(String(e.message))});return()=>{lifecycle.cancel();alive.current=false}},[refresh])
 async function pair(){setBusy(true);setError('');try{const data=await request(account,'pair/claim',{userCode:code.trim()});if(!alive.current)return;setSource(data.sourceOwner);setCode('');setParams({}, {replace:true});await refresh()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}}
 async function revoke(deviceId:string){setBusy(true);setError('');try{await request(account,'revoke',{deviceId});await refresh()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}}
 const sources=[...new Set(devices.map(d=>d.sourceOwner))]
 return <div className="quiet-page mx-auto max-w-5xl space-y-6 pb-28"><header><Link to="/profile" className="text-sm text-[var(--app-muted)]">← 我的</Link><h1 className="mt-3 font-serif text-3xl">九分学长 · 私人复习</h1><p className="mt-2 text-sm text-[var(--app-muted)]">连接桌面助手，继续原有错题与 FSRS 复习进度。</p></header>
 <section className={box}><h2 className="font-medium">连接桌面助手</h2><div className="mt-3 flex flex-wrap gap-2"><input aria-label="桌面配对码" value={code} onChange={e=>setCode(e.target.value)} placeholder="输入桌面显示的配对码" className="min-w-0 flex-1 rounded-xl border p-2"/><button className={button} disabled={busy||!code.trim()} onClick={()=>void pair()}>确认配对到当前账号</button></div><p className="mt-2 text-xs text-[var(--app-muted)]">配对后由桌面导入已有错题、笔记及进度。解除连接会停止该设备访问，保留你的复习数据。</p>
 {devices.length>0&&<details className="mt-4"><summary className="cursor-pointer text-sm">已连接设备（{devices.filter(d=>!d.revoked).length}）</summary><ul className="mt-2 space-y-2">{devices.map(d=><li key={d.deviceId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{d.deviceName} · {d.sourceOwner} {d.revoked?'（已解除）':''}</span>{!d.revoked&&<button disabled={busy} className={button} onClick={()=>void revoke(d.deviceId)}>解除连接</button>}</li>)}</ul></details>}</section>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 {sources.length>1&&<label className="block text-sm">错题来源 <select className="ml-2 rounded-lg border p-2" value={source} onChange={e=>setSource(e.target.value)}>{sources.map(s=><option key={s}>{s}</option>)}</select></label>}
 {source?<LibraryView key={account+'|'+source} account={account} source={source}/>:<p className="text-sm text-[var(--app-muted)]">尚未连接来源。请在桌面助手生成配对码。</p>}
 </div>
}
function LibraryView({account,source}:{account:string;source:string}){
 const [library,setLibrary]=useState<JiufenLibrary|null>(null),[core,setCore]=useState<JiufenCore|null>(null),[status,setStatus]=useState('正在打开本地复习库…'),[error,setError]=useState(''),[pending,setPending]=useState(false),[playing,setPlaying]=useState(false),[resourceReady,setResourceReady]=useState(false),[clock,setClock]=useState(Date.now()),[syncModule,setSyncModule]=useState<JiufenSyncModule|null>(null)
 const libraryRef=useRef<JiufenLibrary|null>(null),engine=useRef<JiufenSyncEngine|null>(null),alive=useRef(true),audio=useRef<HTMLAudioElement|null>(null),playback=useRef<ReturnType<typeof createSegmentPlayback>|null>(null),resource=useRef<{id:string;guard:ReturnType<typeof createSegmentResourceGuard>}|null>(null),locked=useRef(false),syncTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const drafts=useRef<Record<string,string>>({})
 const publish=useCallback((next:JiufenLibrary)=>{if(alive.current){libraryRef.current=next;setLibrary(next)}},[])
 const run=useCallback(async()=>{try{await engine.current?.run()}catch(e){if(alive.current){setStatus('同步失败，修改已保存在本机');setError(e instanceof Error?e.message:String(e))}}},[])
 const mutate=useCallback(async(fn:(l:JiufenLibrary)=>JiufenLibrary)=>{
  const next=await updateJiufenLibrary(account,source,fn);publish(next)
  if(syncTimer.current)clearTimeout(syncTimer.current)
  syncTimer.current=setTimeout(()=>{if(alive.current)void run()},600)
  return next
 },[account,source,publish,run])
 useEffect(()=>{
  alive.current=true
  const lifecycle=createJiufenLifecycle()
  let ownedEngine:JiufenSyncEngine|null=null
  const runOwned=async()=>{if(!lifecycle.active())return;try{await ownedEngine?.run()}catch(e){if(lifecycle.active()){setStatus('同步失败，修改已保存在本机');setError(e instanceof Error?e.message:String(e))}}}
  void (async()=>{
   const modules=await loadJiufenModules();if(!lifecycle.active())return
   setCore(modules.core)
   const initial=await updateJiufenLibrary(account,source,l=>lifecycle.active()?({...{version:1,owner:source,cards:[],questionNotes:{},session:null,limit:null,day:modules.core.dayKey(),finishedCount:0,completedKeys:[]},...l,...(l.day&&l.day!==modules.core.dayKey()?{day:modules.core.dayKey(),finishedCount:0,completedKeys:[]}:{}),session:modules.core.restoreSession(l.session,l.cards)}):l);if(!lifecycle.active())return;publish(initial)
   const sync:JiufenSyncModule=modules.sync;setSyncModule(sync)
   ownedEngine=sync.createJiufenSync({sourceOwner:source,load:()=>loadJiufenLibrary(account,source),commit:async(meta,updates)=>{
    if(!lifecycle.active())return
    const next=await updateJiufenLibrary(account,source,latest=>lifecycle.active()?sync.applyJiufenCommit(latest,meta,updates,{deferKeys:activeJiufenDeferKeys(source,latest)}):latest);if(lifecycle.active())publish(next)
   },exchange:async payload=>{
    if(!lifecycle.active())throw Error('页面已关闭')
    const result=await request(account,'exchange',payload)
    if(!lifecycle.active())throw Error('页面已关闭')
    return {...result,records:(result.records??[]).filter((r:{key:string})=>r.key.startsWith(`jiufen/${encodeURIComponent(source)}/`))}
   },onStatus:value=>{if(lifecycle.active()){const state=value as {phase:string;message?:string;lastSyncedAt?:number};setStatus(({syncing:'正在同步…',error:'同步失败，修改保存在本机',conflict:'有同步冲突需要处理',synced:'已同步'} as Record<string,string>)[state.phase]+(state.lastSyncedAt?' · '+new Date(state.lastSyncedAt).toLocaleTimeString():''))}}})
   const own=ownedEngine;engine.current=own;lifecycle.own(()=>{own.dispose();if(engine.current===own)engine.current=null})
   await runOwned();if(!lifecycle.active())return
   const interval=setInterval(()=>void runOwned(),30000);lifecycle.own(()=>clearInterval(interval))
  })().catch(e=>{if(lifecycle.active())setError(e instanceof Error?e.message:String(e))})
  const online=()=>void runOwned();window.addEventListener('online',online)
  const foreground=()=>{if(!document.hidden)void runOwned()};document.addEventListener('visibilitychange',foreground)
  const ticker=setInterval(()=>setClock(Date.now()),1000)
  lifecycle.own(()=>{clearInterval(ticker);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',foreground)})
  return()=>{lifecycle.cancel();alive.current=false;if(syncTimer.current)clearTimeout(syncTimer.current)}
 },[account,source,publish,run])
 const session=library?.session,card=library?.cards.find(c=>c.key===session?.queue[0]?.key)
 const clip=card&&core?core.sentenceAudioClip(card):null
 const clipUrl=clip?.url??'',clipStart=clip?.start??0,clipEnd=clip?.end??0,cardKey=card?.key??'',occurrenceId=session?.occurrence.id
 const resourceId=JSON.stringify([cardKey,occurrenceId,clipUrl,clipStart,clipEnd])
 useEffect(()=>{
  setResourceReady(false);resource.current=null
  if(!clipUrl||!Number.isFinite(clipStart)||!Number.isFinite(clipEnd)||clipEnd<=clipStart)return
  const player=new Audio();audio.current=player;player.preload='metadata';player.src=clipUrl
  let gone=false
  const guard=createSegmentResourceGuard({start:clipStart,end:clipEnd});resource.current={id:resourceId,guard}
  const controls=createSegmentPlayback(player,{start:clipStart,end:clipEnd},value=>{if(!gone)setPlaying(value)},()=>{if(!gone)setError('音频播放失败，请重试')});playback.current=controls;controls.setLoop(!!libraryRef.current?.session?.replay.loop);controls.setRate(libraryRef.current?.session?.replay.speed??1)
  const onPlaying=()=>{
   if(!guard.canPlay()){controls.pause();return}
   void mutate(latest=>{if(latest.session?.queue[0]?.key!==cardKey||latest.session.occurrence.id!==occurrenceId)return latest;return {...latest,session:{...latest.session,occurrence:{...latest.session.occurrence,played:true}}}}).catch(e=>setError(String(e)))
  }
  const onError=()=>{guard.invalidate();controls.pause();setResourceReady(false);if(!gone)setError('音频暂时无法播放，请重试；未播放成功不会开放评分。')}
  const onMetadata=()=>{if(!guard.validate(player.duration)){controls.pause();setResourceReady(false);setError('句段时间超出原音频或资源无效，请在桌面补全时间后同步。');return}setResourceReady(true);setError('');player.currentTime=clipStart}
  player.addEventListener('loadedmetadata',onMetadata);player.addEventListener('playing',onPlaying);player.addEventListener('error',onError)
  return()=>{gone=true;controls.dispose();if(playback.current===controls)playback.current=null;player.pause();player.removeEventListener('loadedmetadata',onMetadata);player.removeEventListener('playing',onPlaying);player.removeEventListener('error',onError);player.removeAttribute('src');player.load();if(audio.current===player)audio.current=null;setPlaying(false)}
 },[clipUrl,clipStart,clipEnd,cardKey,occurrenceId,resourceId,mutate])
 async function action(fn:()=>Promise<unknown>){if(locked.current)return;locked.current=true;setPending(true);setError('');try{await fn()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{locked.current=false;if(alive.current)setPending(false)}}
 async function begin(){if(!core)return;await mutate(l=>({...l,session:core.restoreSession(l.session,l.cards)??core.createSession(l.cards,null)}))}
 async function score(rating:string){if(!core||!card||!session||resource.current?.id!==resourceId||!resource.current.guard.canPlay())return;const snapshot={key:card.key,id:session.occurrence.id};await action(async()=>{
  playback.current?.pause();await mutate(latest=>{if(resource.current?.id!==resourceId||!resource.current.guard.canPlay())throw Error('音频资源尚未验证，请等待有效句段');return applyJiufenRating(latest,core,snapshot.key,snapshot.id,rating)})
 })}
 async function play(restart=false){const controls=playback.current;if(!controls||resource.current?.id!==resourceId||!resource.current.guard.canPlay())return;if(playing&&!restart){controls.pause();return}await controls.play(restart)}
 if(!library||!core)return <p role="status">{error||'正在打开复习库…'}</p>
 const active=library.cards.filter(c=>!c.deletedAt),deleted=library.cards.filter(c=>c.deletedAt)
 const records=(library.bridgeSync?.records??{}) as Record<string,{conflict?:unknown;incoming?:unknown}>
 const conflicts=Object.fromEntries(Object.entries(records).filter(([,r])=>r.conflict).map(([k,r])=>[k,r.conflict]))
 const incoming=Object.keys(records).filter(k=>records[k].incoming)
 const dueAt=session?.queue[0]?.dueAt??0,waiting=dueAt>clock
 const ratings=[['fuzzy','模糊'],['hard','困难'],['good','良好'],['easy','易懂']]
 return <>
 <section className={box}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">当前进度 · {active.length} 张错题</h2><p role="status" className="mt-1 text-xs text-[var(--app-muted)]">{status}</p></div><button className={button} disabled={pending} onClick={()=>void action(run)}>立即同步</button></div><p className="mt-2 text-xs text-[var(--app-muted)]">修改先保存在当前账号的本机复习库，联网后自动同步。</p></section>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 {Object.keys(conflicts).length>0&&<section className={box}><h2>同步冲突</h2><p className="text-sm">复习进度冲突请采用云端版本后重新评分。笔记可选择保留本机或云端。</p>{Object.entries(conflicts).map(([key,value])=><div key={key} className="mt-3 space-y-2 border-t pt-3"><p className="break-all text-xs">{key}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value,null,2)}</pre><button className={button} onClick={()=>void action(async()=>{playback.current?.pause();await engine.current?.resolve(key,'remote');delete drafts.current[decodeURIComponent(key.split('/')[3])];if(syncModule)await mutate(l=>{const next=syncModule.applyJiufenIncoming(l);return key.includes('/memory/')?{...next,session:core.createSession(next.cards,null)}:next})})}>采用云端</button>{!key.includes('/memory/')&&<button className={button} onClick={()=>void action(async()=>{await engine.current?.resolve(key,'local');publish(await loadJiufenLibrary(account,source))})}>保留本机</button>}</div>)}</section>}
 {incoming.length>0&&<section className={box}><p className="text-sm">当前句的云端内容、笔记或进度已更新。接续后保留编辑冲突，并按最新进度重建本机复习队列。</p><button className={button+' mt-3'} onClick={()=>void action(async()=>{playback.current?.pause();if(syncModule){const continued=await mutate(l=>{const next=syncModule.applyJiufenIncoming(l);return {...next,session:core.createSession(next.cards,null)}});for(const id of Object.keys(drafts.current)){const row=(continued.bridgeSync?.records as Record<string,{conflict?:unknown;incoming?:unknown}>|undefined)?.[`jiufen/${encodeURIComponent(source)}/note/${encodeURIComponent(id)}`];if(!row?.conflict&&!row?.incoming)delete drafts.current[id]}publish(continued)}})}>接续云端进度</button></section>}
 {!session&&<section className={box}><p className="mb-4 text-sm">{active.length?'按原有 FSRS 计划开始或继续今天的听句复习。':'等待桌面上传已有错题和进度，随后点击同步。'}</p><button disabled={!active.length||pending} className={button} onClick={()=>void action(begin)}>开始 / 恢复复习</button></section>}
 {session&&!card&&<section className={box}><h2 className="text-xl font-serif">本轮复习已完成</h2><button className={button+' mt-4'} onClick={()=>void action(async()=>{await mutate(l=>({...l,session:core.createSession(l.cards,null)}))})}>重新检查到期题目</button></section>}
 {session&&card&&<section className={box}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-[var(--app-muted)]">待复习 {session.queue.length} · Part {card.source?.partNum||'—'} · 题号 {card.source?.numbers?.join('、')}</p><h2 className="mt-2 text-xl font-serif">{card.title}</h2></div><button disabled={pending} className={button} onClick={()=>void action(async()=>{await mutate(l=>core.deleteReviewCard(l,card.key))})}>移入回收站</button></div>
 <div className="mt-5 flex flex-wrap items-center gap-2"><button className={button} disabled={!clip||!resourceReady} onClick={()=>void play()}>{playing?'暂停':'播放句段'}</button><button className={button} disabled={!clip||!resourceReady} onClick={()=>void play(true)}>从头重播</button><label className="text-sm">速度 <select aria-label="播放速度" value={session.replay.speed} onChange={e=>{const speed=Number(e.target.value);playback.current?.setRate(speed);void mutate(l=>l.session?{...l,session:{...l.session,replay:{...l.session.replay,speed}}}:l)}} className="rounded-lg border p-2">{[.8,1,1.25,1.5].map(n=><option key={n} value={n}>{n}×</option>)}</select></label><button aria-pressed={session.replay.loop} className={button} onClick={()=>{playback.current?.setLoop(!session.replay.loop);void mutate(l=>l.session?{...l,session:{...l.session,replay:{...l.session.replay,loop:!l.session.replay.loop}}}:l)}}>循环 · 间隔 3 秒{session.replay.loop?' · 开':' · 关'}</button></div>
 {!clip&&<p className="mt-2 text-sm text-amber-700">该题缺少有效句段，等待桌面补全音频时间。</p>}
 <div className="mt-5 flex flex-wrap gap-2"><button className={button} aria-expanded={session.occurrence.revealed} onClick={()=>void mutate(l=>l.session?{...l,session:{...l.session,occurrence:{...l.session.occurrence,revealed:!l.session.occurrence.revealed,everRevealed:true}}}:l)}>{session.occurrence.revealed?'隐藏原文':'显示原文'}</button><button className={button} aria-expanded={session.occurrence.translationRevealed} onClick={()=>void mutate(l=>l.session?{...l,session:{...l.session,occurrence:{...l.session.occurrence,translationRevealed:!l.session.occurrence.translationRevealed}}}:l)}>中文翻译</button></div>
 {session.occurrence.revealed&&<div className="mt-4 space-y-3 leading-8"><p className="font-semibold text-blue-600">原答案：{core.reviewAnswerLabels(card).join(' / ')}</p>{card.sentences?.map(s=><p key={s.index}>{core.sentenceAnswerRuns(card,s.text).map((r,i)=><span key={i} className={r.answer?'font-semibold text-blue-600':''}>{r.text}</span>)}</p>)}</div>}
 {session.occurrence.translationRevealed&&<div className="mt-3 space-y-2 text-sm text-[var(--app-muted)]">{card.sentences?.map(s=><p key={s.index}>{s.translation||'此句暂未提供翻译'}</p>)}</div>}
 {session.occurrence.revealed&&<div className="mt-5 space-y-3">{(card.source?.questionIds??[card.key]).map((id,i)=><label key={id} className="block text-sm">题 {card.source?.numbers?.[i]??i+1} · 独立笔记<textarea className="mt-2 block min-h-24 w-full rounded-xl border p-3" value={drafts.current[id]??library.questionNotes[id]?.content??''} onChange={e=>{const value=e.target.value;drafts.current[id]=value;setLibrary(l=>l?{...l}:l);void mutate(l=>({...l,questionNotes:{...l.questionNotes,[id]:{...l.questionNotes[id],content:value}}})).catch(e=>setError(String(e)))}}/></label>)}{card.note&&<div className="rounded-xl border p-3 text-sm"><strong>原分组笔记</strong><p className="mt-2 whitespace-pre-wrap">{card.note}</p></div>}</div>}
 {waiting&&<p role="status" className="mt-4 text-sm">此句将在 {Math.ceil((dueAt-clock)/1000)} 秒后到期，可先重听。</p>}
 {session.occurrence.grade?<button className={button+' mt-5'} disabled={pending} onClick={()=>void action(async()=>{await mutate(l=>advanceJiufenReview(l,core))})}>下一句 →</button>:<div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{ratings.map(([rating,label])=><button key={rating} className={button+' py-3'} disabled={pending||!resourceReady||!session.occurrence.played||waiting||!clip||!card.memory||incoming.length>0||Object.keys(conflicts).some(k=>k.includes('/memory/'))} onClick={()=>void score(rating)}><strong>{label}</strong><small className="mt-1 block">{card.memory?core.previewSentence(card,rating).label:'等待进度同步'}</small></button>)}</div>}
 {!session.occurrence.played&&<p className="mt-2 text-xs text-[var(--app-muted)]">请先播放句段，再选择记忆程度。</p>}
 </section>}
 {deleted.length>0&&<details className={box}><summary className="cursor-pointer">回收站（{deleted.length}）</summary><ul className="mt-3 space-y-3">{deleted.map(c=><li className="flex flex-wrap items-center justify-between gap-2" key={c.key}><span className="text-sm">{c.title} · {c.source?.numbers?.join('、')}</span><button className={button} disabled={pending} onClick={()=>void action(async()=>{await mutate(l=>core.restoreReviewCard(l,c.key))})}>恢复</button></li>)}</ul></details>}
 </>
}

