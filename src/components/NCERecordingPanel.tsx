import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LocalRecorder, recordingSupported } from '@/lib/localRecorder';
import { deleteRecording, listRecordings, recordingFilename, saveRecording, type LocalRecording } from '@/lib/nceRecordingStore';

function RecordingAudio({row,onAudio,playbackSignal}:{row:LocalRecording;onAudio:(element:HTMLAudioElement)=>void;playbackSignal:number}) {
 const audio=useRef<HTMLAudioElement>(null);
 const download=useRef<HTMLAnchorElement>(null);
 useEffect(()=>{const element=audio.current;const next=URL.createObjectURL(row.blob);if(element)element.src=next;if(download.current)download.current.href=next;return()=>{element?.pause();URL.revokeObjectURL(next)}},[row.blob]);
 useEffect(()=>{audio.current?.pause()},[playbackSignal]);
 return <div className="space-y-2 min-w-0">
  <audio ref={audio} controls preload="metadata" onPlay={e=>onAudio(e.currentTarget)} aria-label="回放个人录音" className="w-full max-w-full" />
  <a ref={download} download={recordingFilename(row)} className="text-sm text-sky-700 underline">下载备份</a>
 </div>;
}
function microphoneError(error:unknown) {
 if (error instanceof DOMException) {
  if(error.name==='NotAllowedError') return '麦克风权限未开启，请在浏览器网站权限中允许后重试。';
  if(error.name==='NotFoundError') return '未找到麦克风，请连接麦克风后重试。';
  if(error.name==='NotReadableError') return '麦克风暂时不可用，请关闭其他占用麦克风的应用后重试。';
 }
 return error instanceof Error ? error.message : '录音失败，请重试。';
}
export function NCERecordingPanel({owner,cardId,moduleId,onBusyChange,onAudio,playbackSignal,defaultOpen=false,disabled=false}:{
 owner:string;cardId:string;moduleId:string;onBusyChange:(busy:boolean)=>void;onAudio:()=>void;playbackSignal:number;defaultOpen?:boolean;disabled?:boolean;
}) {
 const [rows,setRows]=useState<LocalRecording[]>([]);
 const [phase,setPhase]=useState<'idle'|'requesting'|'recording'|'saving'>('idle');
 const [draft,setDraft]=useState<LocalRecording|null>(null);
 const [error,setError]=useState('');
 const [loaded,setLoaded]=useState(false);
 const [open,setOpen]=useState(defaultOpen);
 const recorder=useRef<LocalRecorder|null>(null);
 const alive=useRef(true);
 const operation=useRef(false);
 const playing=useRef<HTMLAudioElement|null>(null);
 const blocked=phase!=='idle' || !!draft;
 const refresh=useCallback(async()=>{const next=await listRecordings(owner,cardId);if(alive.current){setRows(next);setLoaded(true)}},[owner,cardId]);
 useEffect(()=>{
  alive.current=true;
  void refresh().catch(()=>{if(alive.current){setLoaded(true);setError('本地录音读取失败，请点击重新读取。')}});
  return()=>{alive.current=false;recorder.current?.dispose();playing.current?.pause();onBusyChange(false)};
 },[refresh,onBusyChange]);
 useEffect(()=>{onBusyChange(blocked)},[blocked,onBusyChange]);
 const save=async(row:LocalRecording)=>{
  setPhase('saving');
  try {await saveRecording(row);if(alive.current){setRows(previous=>[row,...previous]);setDraft(null);setError('')}}
  catch {if(alive.current)setError('本地保存失败。请重试保存或先下载备份；丢弃前录音仍留在本页。')}
  finally {if(alive.current)setPhase('idle')}
 };
 async function start() {
  if(operation.current || blocked || disabled) return;
  operation.current=true;onBusyChange(true);setPhase('requesting');setError('');onAudio();playing.current?.pause();
  const next=new LocalRecorder();recorder.current=next;
  try {await next.start();if(alive.current && recorder.current===next)setPhase('recording')}
  catch(e){if(alive.current && recorder.current===next){setError(microphoneError(e));setPhase('idle')}}
  finally {if(recorder.current===next)operation.current=false}
 }
 async function stop() {
  if(operation.current || phase!=='recording') return;
  operation.current=true;setPhase('saving');
  try {
   const result=await recorder.current!.stop();
   if(!alive.current)return;
   const row:LocalRecording={id:crypto.randomUUID(),owner,cardId,moduleId,createdAt:Date.now(),...result};
   setDraft(row);await save(row);
  }catch(e){if(alive.current){setError(microphoneError(e));setPhase('idle')}}
  finally {operation.current=false}
 }
 const stopRef=useRef(()=>{});stopRef.current=()=>{if(phase==='requesting')cancel();else void stop()};
 useEffect(()=>{
  const hide=()=>{if(document.hidden)stopRef.current()};
  document.addEventListener('visibilitychange',hide);
  return()=>document.removeEventListener('visibilitychange',hide);
 },[]);
 function cancel() {recorder.current?.dispose();recorder.current=null;operation.current=false;setPhase('idle');setError('');onBusyChange(false)}
 function play(element:HTMLAudioElement) {if(phase!=='idle'){element.pause();return}onAudio();if(playing.current!==element)playing.current?.pause();playing.current=element}
 async function remove(row:LocalRecording) {
  if(operation.current || blocked) return;
  operation.current=true;setPhase('saving');
  try {await deleteRecording(owner,cardId,row.id);await refresh();setError('')}
  catch {if(alive.current)setError('删除失败，请重试。')}
  finally {operation.current=false;if(alive.current)setPhase('idle')}
 }
 return <details className="nce-options" open={open || blocked} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>个人录音 · 本地保存{rows.length ? ` · ${rows.length} 条` : ''}</summary>
  <section aria-label="个人录音回放" className="mt-4 space-y-4 min-w-0">
   <p className="text-xs leading-relaxed text-slate-500">仅保存在当前设备的浏览器里，不上传。清理浏览器数据或更换设备后无法恢复，请下载备份。录音用于回听，不评价发音质量。</p>
   {!recordingSupported() ? <p role="status" className="text-sm">当前环境不支持网页录音。请使用支持录音的浏览器，并通过 HTTPS 打开网站。</p> :
   <div className="flex flex-wrap gap-2">
    <Button type="button" disabled={disabled || blocked || operation.current} onClick={()=>{void start()}}>开始录音</Button>
    {phase==='requesting' && <><span role="status" className="text-sm">请允许使用麦克风…</span><Button variant="outline" onClick={cancel}>取消请求</Button></>}
    {phase==='recording' && <Button type="button" className="bg-red-700 text-white" onClick={()=>{void stop()}}>停止并保存</Button>}
    {phase==='saving' && <span role="status">正在保存录音…</span>}
   </div>}
   {phase==='recording' && <p role="status" className="text-sm font-semibold text-red-700">正在录音，停止并保存后可切换句子。</p>}
   {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
   {draft && <div className="space-y-3 rounded-lg border border-red-200 p-3">
    <p className="text-sm">这次录音尚未保存</p><RecordingAudio row={draft} onAudio={play} playbackSignal={playbackSignal}/>
    <div className="flex flex-wrap gap-2"><Button disabled={phase==='saving'} onClick={()=>{void save(draft)}}>重试保存</Button><Button variant="outline" disabled={phase==='saving'} onClick={()=>{setDraft(null);setError('')}}>丢弃未保存录音</Button></div>
   </div>}
   {error && !draft && phase==='idle' && <Button variant="outline" onClick={()=>{void refresh().then(()=>setError('')).catch(()=>setError('本地录音读取失败，请重试。'))}}>重新读取</Button>}
   {!loaded && <p role="status">正在读取本地录音…</p>}
   {loaded && !rows.length && !draft && <p className="text-xs text-slate-500">当前句还没有录音。</p>}
   {rows.map(row=><div key={row.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{new Date(row.createdAt).toLocaleString()} · {Math.round(row.durationMs/1000)} 秒</span><Button type="button" size="sm" variant="ghost" disabled={blocked} onClick={()=>{void remove(row)}} aria-label="删除这条录音">删除</Button></div>
    <RecordingAudio row={row} playbackSignal={playbackSignal} onAudio={play}/>
   </div>)}
  </section>
 </details>;
}
