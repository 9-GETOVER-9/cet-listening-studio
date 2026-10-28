import {createJiufenLifecycle} from '@/lib/jiufenLifecycle'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Link,useSearchParams,useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from '@/hooks/useAuth'
import {supabase} from '@/lib/supabase'
import {loadJiufenLibrary,updateJiufenLibrary,applyJiufenRating,advanceJiufenReview,activeJiufenDeferKeys} from '@/lib/jiufenRepository'
import {loadJiufenModules,type JiufenCore,type JiufenLibrary,type JiufenSyncEngine,type JiufenSyncModule} from '@/lib/jiufenTypes'
import {createSegmentPlayback,createSegmentResourceGuard} from '@/lib/jiufenAudio'

const button='rounded-xl border border-[var(--app-line)] px-4 py-2 text-sm disabled:opacity-40 hover:bg-[var(--app-paper-2)]'
const box='rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-4 sm:p-6'
interface Device {deviceId:string;sourceOwner:string;deviceName:string;revoked:boolean}
interface AudioCacheStatus {cards:number;cardsWithAudio:number;tracks:number;ready:number;queued:number;downloading:number;failed:number;pending:number;readyBytes:number}
interface AudioDiagnosticEvent {event:string;afterMs:number;readyState:number;networkState:number;currentTime:number|null;duration:number|null;paused:boolean;errorCode:number|null}
interface AudioDiagnostic {startedAt:number;mime:string|null;size:number|null;events:AudioDiagnosticEvent[]}
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
 const location=useLocation(),practiceMode=location.pathname==='/jiufen/review'
 const [params,setParams]=useSearchParams()
 const [code,setCode]=useState(params.get('pair')??'')
 const [devices,setDevices]=useState<Device[]>([]),[source,setSource]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[devicesLoaded,setDevicesLoaded]=useState(false)
 const alive=useRef(true),deviceGeneration=useRef(0)
 const refresh=useCallback(async()=>{const generation=++deviceGeneration.current;try{const data=await request(account,'devices');if(!alive.current||generation!==deviceGeneration.current)return;setDevices(data.devices);setSource(old=>old||data.devices[0]?.sourceOwner||'')}finally{if(alive.current&&generation===deviceGeneration.current)setDevicesLoaded(true)}},[account])
 useEffect(()=>{const lifecycle=createJiufenLifecycle();alive.current=true;void refresh().catch(e=>{if(lifecycle.active())setError(String(e.message))});return()=>{lifecycle.cancel();alive.current=false}},[refresh])
 async function pair(){setBusy(true);setError('');try{const data=await request(account,'pair/claim',{userCode:code.trim()});if(!alive.current)return;setSource(data.sourceOwner);setCode('');setParams({}, {replace:true});await refresh()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}}
 async function revoke(deviceId:string){setBusy(true);setError('');try{await request(account,'revoke',{deviceId});await refresh()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}}
 const sources=[...new Set(devices.map(d=>d.sourceOwner))]
 return <div className={practiceMode?'min-h-dvh bg-[var(--app-paper)]':'quiet-page mx-auto max-w-5xl space-y-6 pb-28'}>{!practiceMode&&<><header><Link to="/profile" className="text-sm text-[var(--app-muted)]">← 我的</Link><h1 className="mt-3 font-serif text-3xl">九分学长 · 私人复习</h1><p className="mt-2 text-sm text-[var(--app-muted)]">连接桌面助手，继续原有错题与 FSRS 复习进度。</p></header>
 <section className={box}><h2 className="font-medium">连接桌面助手</h2><div className="mt-3 flex flex-wrap gap-2"><input aria-label="桌面配对码" value={code} onChange={e=>setCode(e.target.value)} placeholder="输入桌面显示的配对码" className="min-w-0 flex-1 rounded-xl border p-2"/><button className={button} disabled={busy||!code.trim()} onClick={()=>void pair()}>确认配对到当前账号</button></div><p className="mt-2 text-xs text-[var(--app-muted)]">配对后由桌面导入已有错题、笔记及进度。解除连接会停止该设备访问，保留你的复习数据。</p>
 {devices.length>0&&<details className="mt-4"><summary className="cursor-pointer text-sm">已连接设备（{devices.filter(d=>!d.revoked).length}）</summary><ul className="mt-2 space-y-2">{devices.map(d=><li key={d.deviceId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{d.deviceName} · {d.sourceOwner} {d.revoked?'（已解除）':''}</span>{!d.revoked&&<button disabled={busy} className={button} onClick={()=>void revoke(d.deviceId)}>解除连接</button>}</li>)}</ul></details>}</section>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 {sources.length>1&&!practiceMode&&<label className="block text-sm">错题来源 <select className="ml-2 rounded-lg border p-2" value={source} onChange={e=>setSource(e.target.value)}>{sources.map(s=><option key={s}>{s}</option>)}</select></label>}
 </>}
 {source?<LibraryView key={account+'|'+source} account={account} source={source}/>:practiceMode&&!devicesLoaded?<p role="status" className="mx-auto grid min-h-[70dvh] max-w-lg place-items-center px-5 text-center text-sm text-[var(--app-muted)]">正在恢复错句复习进度…</p>:<p className="p-6 text-sm text-[var(--app-muted)]">尚未连接来源。请返回错句库页面完成连接。</p>}
 </div>
}
function LibraryView({account,source}:{account:string;source:string}){
 const navigate=useNavigate(),location=useLocation(),practiceMode=location.pathname==='/jiufen/review'
 const [library,setLibrary]=useState<JiufenLibrary|null>(null),[core,setCore]=useState<JiufenCore|null>(null),[status,setStatus]=useState('正在打开本地复习库…'),[error,setError]=useState(''),[pending,setPending]=useState(false),[playing,setPlaying]=useState(false),[resourceReady,setResourceReady]=useState(false),[audioLoadRequested,setAudioLoadRequested]=useState(false),[audioDiagnosticText,setAudioDiagnosticText]=useState(''),[audioDiagnosticStatus,setAudioDiagnosticStatus]=useState(''),[clock,setClock]=useState(Date.now()),[syncModule,setSyncModule]=useState<JiufenSyncModule|null>(null),[audioCache,setAudioCache]=useState<AudioCacheStatus|null>(null),[cachedAudioUrl,setCachedAudioUrl]=useState(''),[cachedAudioState,setCachedAudioState]=useState<'loading'|'ready'|'failed'|'missing'>('loading'),[audioRetry,setAudioRetry]=useState(0)
 const libraryRef=useRef<JiufenLibrary|null>(null),engine=useRef<JiufenSyncEngine|null>(null),alive=useRef(true),audio=useRef<HTMLAudioElement|null>(null),playback=useRef<ReturnType<typeof createSegmentPlayback>|null>(null),resource=useRef<{id:string;guard:ReturnType<typeof createSegmentResourceGuard>}|null>(null),audioDiagnostic=useRef<AudioDiagnostic>({startedAt:Date.now(),mime:null,size:null,events:[]}),locked=useRef(false),syncTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const recordAudioEvent=useCallback((event:string,player:HTMLAudioElement)=>{
  const diagnostic=audioDiagnostic.current
  diagnostic.events.push({event,afterMs:Math.max(0,Math.round(performance.now()-diagnostic.startedAt)),readyState:player.readyState,networkState:player.networkState,currentTime:Number.isFinite(player.currentTime)?Math.round(player.currentTime*100)/100:null,duration:Number.isFinite(player.duration)?Math.round(player.duration*100)/100:null,paused:player.paused,errorCode:player.error?.code??null})
  if(diagnostic.events.length>30)diagnostic.events.splice(0,diagnostic.events.length-30)
 },[])
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
 const libraryReady=!!library
 useEffect(()=>{
  if(!libraryReady)return
  let live=true,timer:number|undefined
  const poll=async(first=false)=>{
   try{
    const result=await request(account,first?'audio-cache/start':'audio-cache/status',{sourceOwner:source}) as AudioCacheStatus
    if(!live)return
    setAudioCache(result)
    timer=window.setTimeout(()=>void poll(false),result.pending?4000:30000)
   }catch(e){if(live){setError(e instanceof Error?e.message:String(e));timer=window.setTimeout(()=>void poll(false),30000)}}
  }
  void poll(true)
  return()=>{live=false;if(timer)clearTimeout(timer)}
 },[account,source,libraryReady])
 const session=library?.session,card=library?.cards.find(c=>c.key===session?.queue[0]?.key)
 const clip=card&&core?core.sentenceAudioClip(card):null
 const clipUrl=clip?.url??'',clipStart=clip?.start??0,clipEnd=clip?.end??0,cardKey=card?.key??'',occurrenceId=session?.occurrence.id
 useEffect(()=>{
  let live=true,timer:number|undefined
  setCachedAudioUrl('');setCachedAudioState(clipUrl?'loading':'missing')
  if(!cardKey||!clipUrl||!Number.isFinite(clipStart)||!Number.isFinite(clipEnd)||clipEnd<=clipStart)return()=>{live=false}
  const lookup=async()=>{
   try{
    const result=await request(account,'audio/ticket',{sourceOwner:source,cardKey}) as {state:string;url?:string;mime?:string;size?:number}
    if(!live)return
    if(result.state==='ready'&&result.url){audioDiagnostic.current.mime=result.mime??null;audioDiagnostic.current.size=typeof result.size==='number'&&Number.isFinite(result.size)?result.size:null;setCachedAudioUrl(result.url);setCachedAudioState('ready');return}
    if(result.state==='missing'||result.state==='failed'){setCachedAudioState(result.state);return}
    setCachedAudioState('loading');timer=window.setTimeout(()=>void lookup(),4000)
   }catch{if(live){setCachedAudioState('failed');timer=window.setTimeout(()=>void lookup(),10000)}}
  }
  void lookup()
  return()=>{live=false;if(timer)clearTimeout(timer)}
 },[account,source,cardKey,clipUrl,clipStart,clipEnd,audioRetry])
 const resourceId=JSON.stringify([cardKey,occurrenceId,cachedAudioUrl,clipStart,clipEnd])
 useEffect(()=>{
  setResourceReady(false);resource.current=null
  if(!cachedAudioUrl||!Number.isFinite(clipStart)||!Number.isFinite(clipEnd)||clipEnd<=clipStart)return
  setAudioLoadRequested(false);setAudioDiagnosticText('');setAudioDiagnosticStatus('')
  audioDiagnostic.current={startedAt:performance.now(),mime:audioDiagnostic.current.mime,size:audioDiagnostic.current.size,events:[]}
  const player=new Audio();audio.current=player;player.preload='metadata';player.src=cachedAudioUrl
  let gone=false
  const loadTimer=window.setTimeout(()=>{if(!gone&&!resource.current?.guard.canPlay()){recordAudioEvent('metadata_timeout',player);setResourceReady(false);setCachedAudioState('failed')}},15000)
  const guard=createSegmentResourceGuard({start:clipStart,end:clipEnd});resource.current={id:resourceId,guard}
  const controls=createSegmentPlayback(player,{start:clipStart,end:clipEnd},value=>{if(!gone)setPlaying(value)},()=>{if(!gone)setError('音频播放失败，请重试')});playback.current=controls;controls.setLoop(!!libraryRef.current?.session?.replay.loop);controls.setRate(libraryRef.current?.session?.replay.speed??1)
  const onPlaying=()=>{
   recordAudioEvent('playing',player);setAudioLoadRequested(false)
   if(!guard.canPlay()){controls.pause();return}
   void mutate(latest=>{if(latest.session?.queue[0]?.key!==cardKey||latest.session.occurrence.id!==occurrenceId)return latest;return {...latest,session:{...latest.session,occurrence:{...latest.session.occurrence,played:true}}}}).catch(e=>setError(String(e)))
  }
  const onError=()=>{recordAudioEvent('error',player);guard.invalidate();controls.pause();setResourceReady(false);setAudioLoadRequested(false);if(!gone){setCachedAudioState('failed');setError('音频暂时无法播放，请重试；未播放成功不会开放评分。')}}
  const onMetadata=()=>{recordAudioEvent('loadedmetadata',player);if(!guard.validate(player.duration)){controls.pause();setResourceReady(false);setAudioLoadRequested(false);setCachedAudioState('failed');setError('句段时间超出原音频或资源无效，请在桌面补全时间后同步。');return}setResourceReady(true);setCachedAudioState('ready');setError('');player.currentTime=clipStart}
  const eventNames=['loadstart','loadeddata','canplay','waiting','stalled','suspend','abort','emptied'] as const
  const eventHandlers=eventNames.map(name=>{const handler=()=>recordAudioEvent(name,player);player.addEventListener(name,handler);return [name,handler] as const})
  player.addEventListener('loadedmetadata',onMetadata);player.addEventListener('playing',onPlaying);player.addEventListener('error',onError)
  return()=>{gone=true;clearTimeout(loadTimer);controls.dispose();if(playback.current===controls)playback.current=null;player.pause();player.removeEventListener('loadedmetadata',onMetadata);player.removeEventListener('playing',onPlaying);player.removeEventListener('error',onError);for(const[name,handler]of eventHandlers)player.removeEventListener(name,handler);player.removeAttribute('src');player.load();if(audio.current===player)audio.current=null;setPlaying(false)}
 },[cachedAudioUrl,clipStart,clipEnd,cardKey,occurrenceId,resourceId,mutate,recordAudioEvent])
 async function action(fn:()=>Promise<unknown>){if(locked.current)return;locked.current=true;setPending(true);setError('');try{await fn()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{locked.current=false;if(alive.current)setPending(false)}}
 async function begin(){if(!core)return;await mutate(l=>({...l,session:core.restoreSession(l.session,l.cards)??core.createSession(l.cards,null)}));navigate('/jiufen/review')}
 async function score(rating:string){if(!core||!card||!session||resource.current?.id!==resourceId||!resource.current.guard.canPlay())return;const snapshot={key:card.key,id:session.occurrence.id};await action(async()=>{
  playback.current?.pause();await mutate(latest=>{if(resource.current?.id!==resourceId||!resource.current.guard.canPlay())throw Error('音频资源尚未验证，请等待有效句段');return applyJiufenRating(latest,core,snapshot.key,snapshot.id,rating)})
 })}
 async function play(restart=false){const controls=playback.current,player=audio.current;if(!controls||!player||resource.current?.id!==resourceId||!cachedAudioUrl||cachedAudioState==='failed')return;if(playing&&!restart){controls.pause();return}if(!resource.current.guard.canPlay()){setAudioLoadRequested(true);setError('');recordAudioEvent('user_gesture_load',player);player.load();try{await player.play()}catch(e){recordAudioEvent('play_rejected',player);setAudioLoadRequested(false);setError(e instanceof Error?`手机浏览器拒绝播放（${e.name}），请再点一次播放。`:'手机浏览器拒绝播放，请再点一次播放。')}return}await controls.play(restart)}
 async function copyAudioDiagnostic(){
  const player=audio.current,diagnostic=audioDiagnostic.current;let rangeProbe:Record<string,unknown>|null=null
  if(cachedAudioUrl){const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),8000);try{const response=await fetch(cachedAudioUrl,{method:'HEAD',headers:{Range:'bytes=0-1'},cache:'no-store',signal:controller.signal});rangeProbe={status:response.status,acceptRanges:response.headers.get('Accept-Ranges'),contentRange:response.headers.get('Content-Range'),contentLength:response.headers.get('Content-Length'),contentType:response.headers.get('Content-Type')};}catch(e){rangeProbe={error:e instanceof Error?e.name:'request_failed'}}finally{clearTimeout(timeout)}}
  const payload={page:'jiufen-review-audio',userAgent:navigator.userAgent,platform:navigator.platform,cache:audioCache?{ready:audioCache.ready,tracks:audioCache.tracks,pending:audioCache.pending,failed:audioCache.failed}:null,ticket:{mime:diagnostic.mime,size:diagnostic.size},clipSeconds:clip?Math.round((clip.end-clip.start)*100)/100:null,resourceReady,loadRequested:audioLoadRequested,player:player?{readyState:player.readyState,networkState:player.networkState,paused:player.paused,duration:Number.isFinite(player.duration)?player.duration:null,errorCode:player.error?.code??null,buffered:Array.from({length:player.buffered.length},(_,i)=>[Math.round(player.buffered.start(i)*100)/100,Math.round(player.buffered.end(i)*100)/100])}:null,rangeProbe,events:diagnostic.events}
  const text=JSON.stringify(payload,null,2);setAudioDiagnosticText('');try{if(!navigator.clipboard?.writeText)throw Error('clipboard_unavailable');await navigator.clipboard.writeText(text);setAudioDiagnosticStatus('已复制诊断信息；其中不含题目内容、账号或音频票据。')}catch{setAudioDiagnosticText(text);setAudioDiagnosticStatus('无法自动复制，请长按下方文本复制。')}
 }
 if(!library||!core)return <p role="status">{error||'正在打开复习库…'}</p>
 const active=library.cards.filter(c=>!c.deletedAt),deleted=library.cards.filter(c=>c.deletedAt)
 const records=(library.bridgeSync?.records??{}) as Record<string,{conflict?:unknown;incoming?:unknown}>
 const conflicts=Object.fromEntries(Object.entries(records).filter(([,r])=>r.conflict).map(([k,r])=>[k,r.conflict]))
 const incoming=Object.keys(records).filter(k=>records[k].incoming)
 const dueAt=session?.queue[0]?.dueAt??0,waiting=dueAt>clock
 const ratings=[['fuzzy','重来'],['hard','困难'],['good','良好'],['easy','简单']]
 return <>
  {!practiceMode&&<section className={box}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">当前进度 · {active.length} 张错题</h2><p role="status" className="mt-1 text-xs text-[var(--app-muted)]">{status}</p></div><button className={button} disabled={pending} onClick={()=>void action(run)}>立即同步</button></div><p className="mt-2 text-xs text-[var(--app-muted)]">修改先保存在当前账号的本机复习库，联网后自动同步。</p></section>}
  {!practiceMode&&audioCache&&<section className={box}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">错题音频缓存</h2><p className="mt-1 text-xs text-[var(--app-muted)]">已缓存 {audioCache.ready} / {audioCache.tracks} 条不同音轨{audioCache.pending?` · 正在处理 ${audioCache.pending} 条`:''}{audioCache.failed?` · ${audioCache.failed} 条失败`:''} · {(audioCache.readyBytes/1024/1024).toFixed(1)} MB</p></div>{audioCache.failed>0&&<button className={button} disabled={pending} onClick={()=>void action(async()=>{await request(account,'audio-cache/start',{sourceOwner:source});setAudioRetry(n=>n+1)})}>重试失败音频</button>}</div></section>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {!practiceMode&&Object.keys(conflicts).length>0&&<section className={box}><h2>同步冲突</h2><p className="text-sm">复习进度冲突请采用云端版本后重新评分。笔记可选择保留本机或云端。</p>{Object.entries(conflicts).map(([key,value])=><div key={key} className="mt-3 space-y-2 border-t pt-3"><p className="break-all text-xs">{key}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value,null,2)}</pre><button className={button} onClick={()=>void action(async()=>{playback.current?.pause();await engine.current?.resolve(key,'remote');delete drafts.current[decodeURIComponent(key.split('/')[3])];if(syncModule)await mutate(l=>{const next=syncModule.applyJiufenIncoming(l);return key.includes('/memory/')?{...next,session:core.createSession(next.cards,null)}:next})})}>采用云端</button>{!key.includes('/memory/')&&<button className={button} onClick={()=>void action(async()=>{await engine.current?.resolve(key,'local');publish(await loadJiufenLibrary(account,source))})}>保留本机</button>}</div>)}</section>}
  {!practiceMode&&incoming.length>0&&<section className={box}><p className="text-sm">当前句的云端内容、笔记或进度已更新。接续后保留编辑冲突，并按最新进度重建本机复习队列。</p><button className={button+' mt-3'} onClick={()=>void action(async()=>{playback.current?.pause();if(syncModule){const continued=await mutate(l=>{const next=syncModule.applyJiufenIncoming(l);return {...next,session:core.createSession(next.cards,null)}});for(const id of Object.keys(drafts.current)){const row=(continued.bridgeSync?.records as Record<string,{conflict?:unknown;incoming?:unknown}>|undefined)?.[`jiufen/${encodeURIComponent(source)}/note/${encodeURIComponent(id)}`];if(!row?.conflict&&!row?.incoming)delete drafts.current[id]}publish(continued)}})}>接续云端进度</button></section>}
  {!practiceMode&&!session&&<section className={box}><p className="mb-4 text-sm">{active.length?'按原有 FSRS 计划开始或继续今天的听句复习。':'等待桌面上传已有错题和进度，随后点击同步。'}</p><button disabled={!active.length||pending} className={button} onClick={()=>void action(begin)}>开始 / 恢复复习</button></section>}
  {!practiceMode&&session&&<section className={box}><p className="text-sm">今日队列还剩 {session.queue.length} 句。</p><button disabled={!active.length||pending} className={button+' mt-3'} onClick={()=>navigate('/jiufen/review')}>继续复习</button></section>}
  {practiceMode&&!session&&<section className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center px-5 text-center"><p className="text-sm text-[var(--app-muted)]">今天的错句已经准备好</p><h2 className="mt-2 font-serif text-3xl">开始听一句吧。</h2><button disabled={!active.length||pending} className={button+' mt-6 min-h-12 bg-[var(--app-accent)] px-6 text-white'} onClick={()=>void action(begin)}>开始复习</button></section>}
  {practiceMode&&session&&!card&&<section className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center px-5 text-center"><p className="text-sm text-[var(--app-muted)]">本轮复习已完成</p><h2 className="mt-2 font-serif text-3xl">今天听得很认真。</h2><button className={button+' mt-6'} onClick={()=>void action(async()=>{await mutate(l=>({...l,session:core.createSession(l.cards,null)}))})}>再复习一轮</button><button className="mt-3 px-4 py-2 text-sm text-[var(--app-muted)]" onClick={()=>navigate('/jiufen')}>返回错句库</button></section>}
  {practiceMode&&session&&card&&<section className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-3 pb-2 pt-1 sm:px-6"><header className="mb-2 flex items-center justify-between gap-3"><button className="rounded-full px-3 py-2 text-sm text-[var(--app-muted)] hover:bg-[var(--app-paper-2)]" onClick={()=>{playback.current?.pause();navigate('/jiufen')}}>‹ 退出</button><h1 className="font-medium">九分错句复习</h1><span className="text-sm tabular-nums text-[var(--app-muted)]">{Math.max(1,active.length-session.queue.length+1)} / {active.length}</span></header><div className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--app-paper-2)]"><div className="h-full rounded-full bg-[var(--app-accent)] transition-all" style={{width:`${Math.min(100,Math.max(0,(active.length-session.queue.length+1)/Math.max(1,active.length)*100))}%`}}/></div><div className="flex flex-1 flex-col justify-center"><div className="mb-2"><p className="text-xs text-[var(--app-muted)]">{card.title} · {card.source?.partNum?( /^part\b/i.test(String(card.source.partNum))?card.source.partNum:`Part ${card.source.partNum}`):'Part —'} · Q{card.source?.numbers?.join('、')||'—'}</p><h2 className="mt-1 font-serif text-xl leading-tight sm:text-3xl">先听原音，理解这句话</h2></div>
  <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--app-surface)] p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center gap-2"><button className={button+' grid min-h-11 min-w-11 place-items-center rounded-full bg-[var(--app-accent)] px-3 text-white'} disabled={!clip||!cachedAudioUrl||cachedAudioState==='failed'} onClick={()=>void play()} aria-label={playing?'暂停':resourceReady?'播放原音':'加载并播放原音'}>{playing?'Ⅱ':'▶'}</button><button className={button+' min-h-10 px-3'} disabled={!clip||!cachedAudioUrl||cachedAudioState==='failed'} onClick={()=>void play(true)}>重播</button><div className="ml-auto flex items-center gap-2 text-sm"><select aria-label="播放速度" value={session.replay.speed} onChange={e=>{const speed=Number(e.target.value);playback.current?.setRate(speed);void mutate(l=>l.session?{...l,session:{...l.session,replay:{...l.session.replay,speed}}}:l)}} className="min-h-10 rounded-xl border border-[var(--app-line)] bg-transparent px-2">{[.8,1,1.25,1.5].map(n=><option key={n} value={n}>{n}×</option>)}</select><button className={button+' min-h-10 px-3'} aria-pressed={session.replay.loop} onClick={()=>{playback.current?.setLoop(!session.replay.loop);void mutate(l=>l.session?{...l,session:{...l.session,replay:{...l.session.replay,loop:!l.session.replay.loop}}}:l)}} aria-label="循环播放">{session.replay.loop?'循环中':'循环'}</button></div></div><input aria-label="音频进度" type="range" min="0" max="100" value={clip&&audio.current?Math.min(100,Math.max(0,(audio.current.currentTime-clip.start)/(clip.end-clip.start)*100)):0} onChange={e=>{if(audio.current&&clip)audio.current.currentTime=clip.start+Number(e.target.value)/100*(clip.end-clip.start)}} className="h-1.5 w-full accent-[var(--app-accent)]"/><p className="mt-2 text-xs text-[var(--app-muted)]">{clip?`${Math.max(0,clip.end-clip.start).toFixed(1)} 秒原音频`:'此句暂缺有效音频'}{!resourceReady&&clip?(cachedAudioState==='loading'?` · 私有缓存 ${audioCache?.ready??0}/${audioCache?.tracks??'…'}`:cachedAudioState==='missing'?' · 此句缺少可用音频':audioLoadRequested?' · 正在通过点击启动手机音频加载':' · 点播放开始加载原音'):''}</p>{cachedAudioState==='failed'&&clip&&<div className="mt-2 space-y-2 text-xs text-red-700"><div className="flex items-center justify-between gap-2"><span>音频未就绪或加载超时。</span><div className="flex gap-2"><button className={button} onClick={()=>void copyAudioDiagnostic()}>复制排查信息</button><button className={button} onClick={()=>void action(async()=>{await request(account,'audio-cache/start',{sourceOwner:source});setAudioRetry(n=>n+1)})}>重试</button></div></div>{audioDiagnosticStatus&&<p role="status" className="text-[var(--app-muted)]">{audioDiagnosticStatus}</p>}{audioDiagnosticText&&<textarea readOnly aria-label="音频排查信息" className="max-h-36 w-full rounded-xl border border-[var(--app-line)] bg-transparent p-2 font-mono text-[10px] text-[var(--app-ink)]" value={audioDiagnosticText}/>}</div>}</div>
  <div className="mt-2 space-y-2 rounded-3xl border border-[var(--app-line)] bg-[var(--app-surface)] p-3 sm:mt-4 sm:space-y-3 sm:p-4"><details key={card.key} className="space-y-2"><summary className="cursor-pointer text-sm font-medium text-[var(--app-accent)]">展开原句和翻译</summary><div className="space-y-2"><div><p className="text-xs font-medium text-[var(--app-accent)]">原句</p><div className="mt-1 space-y-0.5 text-sm leading-5 text-[var(--app-ink)] sm:mt-1.5 sm:space-y-1 sm:text-base sm:leading-7">{card.sentences?.map(s=><p key={s.index}>{core.sentenceAnswerRuns(card,s.text).map((r,i)=><span key={i} className={r.answer?'rounded bg-blue-50 px-1 font-semibold text-blue-700':''}>{r.text}</span>)}</p>)}</div><p className="mt-1 text-xs text-[var(--app-muted)]">原答案：<span className="font-semibold text-blue-700">{core.reviewAnswerLabels(card).join(' / ')}</span></p></div><div className="border-t border-[var(--app-line)] pt-2"><p className="text-xs font-medium text-[var(--app-accent)]">中文翻译</p><div className="mt-1 space-y-0.5 text-xs leading-5 text-[var(--app-muted)] sm:space-y-1 sm:text-sm sm:leading-6">{card.sentences?.map(s=><p key={s.index}>{s.translation||'此句暂未提供翻译'}</p>)}</div></div></div></details><details className="border-t border-[var(--app-line)] pt-2"><summary className="cursor-pointer text-sm font-medium text-[var(--app-muted)]">我的笔记</summary><div className="mt-2 space-y-2">{(card.source?.questionIds??[card.key]).map((id,i)=><label key={id} className="block text-xs">题 {card.source?.numbers?.[i]??i+1}<textarea className="mt-1.5 block min-h-14 w-full rounded-xl border border-[var(--app-line)] bg-transparent p-2.5 text-sm" value={drafts.current[id]??library.questionNotes[id]?.content??''} onChange={e=>{const value=e.target.value;drafts.current[id]=value;setLibrary(l=>l?{...l}:l);void mutate(l=>({...l,questionNotes:{...l.questionNotes,[id]:{...l.questionNotes[id],content:value}}})).catch(e=>setError(String(e)))}} placeholder="记下生词、替换或听力难点"/></label>)}{card.note&&<p className="whitespace-pre-wrap text-xs text-[var(--app-muted)]">{card.note}</p>}</div></details></div></div>
  {waiting&&<p role="status" className="mt-2 text-center text-xs text-[var(--app-muted)]">此句稍后再复习，可先重听。</p>}
  {session.occurrence.grade?<button className={button+' mt-3 min-h-14 w-full bg-[var(--app-accent)] text-base font-semibold text-white'} disabled={pending} onClick={()=>void action(async()=>{await mutate(l=>advanceJiufenReview(l,core))})}>下一句 →</button>:<div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">{ratings.map(([rating,label])=><button key={rating} className={button+' min-h-12 border-[var(--app-line)] bg-[var(--app-surface)] px-2 py-1 sm:min-h-[3.75rem] sm:py-2'} disabled={pending||!resourceReady||!session.occurrence.played||waiting||!clip||!card.memory||incoming.length>0||Object.keys(conflicts).some(k=>k.includes('/memory/'))} onClick={()=>void score(rating)}><strong className="block">{label}</strong><small className="mt-0.5 block text-xs text-[var(--app-muted)]">{card.memory?core.previewSentence(card,rating).label:'等待进度同步'}</small></button>)}</div>}
  {!session.occurrence.played&&<p className="mt-1.5 text-center text-xs text-[var(--app-muted)]">播放后选择听懂程度</p>}
  </section>}
  {!practiceMode&&deleted.length>0&&<details className={box}><summary className="cursor-pointer">回收站（{deleted.length}）</summary><ul className="mt-3 space-y-3">{deleted.map(c=><li className="flex flex-wrap items-center justify-between gap-2" key={c.key}><span className="text-sm">{c.title} · {c.source?.numbers?.join('、')}</span><button className={button} disabled={pending} onClick={()=>void action(async()=>{await mutate(l=>core.restoreReviewCard(l,c.key))})}>恢复</button></li>)}</ul></details>}
 </>
}

