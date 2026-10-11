import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { NCERecordingPanel } from './NCERecordingPanel';

// This project has no DOM test runtime. Drive the real panel's hooks and handlers
// with persistent hook slots; microphone, RAF, and storage are browser boundaries.
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
const store=vi.hoisted(()=>({list:vi.fn(async()=>[]),save:vi.fn(async()=>{}),remove:vi.fn(async()=>{})}));
vi.mock('@/lib/nceRecordingStore',()=>({listRecordings:store.list,saveRecording:store.save,deleteRecording:store.remove,recordingFilename:()=>''}));
function nodes(value:unknown):ReactElement<Record<string,unknown>>[] {
 if(Array.isArray(value))return value.flatMap(nodes);
 if(!value || typeof value!=='object' || !('props' in value))return [];
 const node=value as ReactElement<Record<string,unknown>>;return [node,...nodes(node.props.children)];
}
function text(value:unknown):string {if(Array.isArray(value))return value.map(text).join('');if(value && typeof value==='object' && 'props' in value)return text((value as ReactElement<{children:unknown}>).props.children);return typeof value==='string'?value:''}
function setup() {
 const order:string[]=[];let grant!:(stream:MediaStream)=>void;
 const trackStop=vi.fn();const stream={getTracks:()=>[{stop:trackStop}]} as unknown as MediaStream;
 const getUserMedia=vi.fn(()=>{order.push('permission');return new Promise<MediaStream>(resolve=>{grant=resolve})});
 const context={state:'running',resume:vi.fn(async()=>{order.push('resume')}),close:vi.fn(async()=>{}),createMediaStreamSource:vi.fn(()=>({connect:vi.fn(),disconnect:vi.fn()})),createAnalyser:()=>({fftSize:2048,getByteTimeDomainData:(data:Uint8Array)=>data.fill(160),disconnect:vi.fn()})};
 const media={state:'inactive',mimeType:'audio/mp4',ondataavailable:null as ((event:BlobEvent)=>void)|null,onstop:null as (()=>void)|null,onerror:null as (()=>void)|null,start(){media.state='recording'},stop(){media.state='inactive';media.ondataavailable?.({data:new Blob(['voice'])} as BlobEvent);media.onstop?.()}};
 const listeners=new Map<string,()=>void>();const document={hidden:false,addEventListener:(key:string,callback:()=>void)=>listeners.set(key,callback),removeEventListener:(key:string)=>listeners.delete(key)};
 vi.stubGlobal('document',document);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});vi.stubGlobal('window',{isSecureContext:true,AudioContext:class{constructor(){return context}}});
 vi.stubGlobal('MediaRecorder',class{constructor(){return media}static isTypeSupported(){return true}});vi.stubGlobal('requestAnimationFrame',vi.fn(()=>7));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const props={owner:'guest',cardId:'card',moduleId:'module',onBusyChange:vi.fn(),onAudio:vi.fn(),playbackSignal:0,disabled:false};
 function render(){hooks.cursor=0;const tree=NCERecordingPanel(props);hooks.effects.splice(0).forEach(effect=>effect());return tree}
 function button(label:string){const node=nodes(render()).find(node=>text(node.props.children)===label && typeof node.props.onClick==='function');expect(node,`button ${label}`).toBeDefined();return node!}
 function click(label:string){(button(label).props.onClick as ()=>void)()}
 return {order,grant:()=>grant(stream),stream,getUserMedia,context,media,trackStop,document,listeners,props,render,button,click};
}
async function settle(){for(let i=0;i<8;i++)await Promise.resolve()}
beforeEach(()=>{hooks.slots=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];vi.clearAllMocks()});
afterEach(()=>{hooks.cleanups.splice(0).forEach(cleanup=>cleanup());vi.unstubAllGlobals()});
it('renders 40 responsive flat bars before recording with no demo or timer',()=>{
 const f=setup();const tree=f.render();const bars=nodes(tree).filter(node=>node.props['data-recording-bar']!==undefined);expect(bars).toHaveLength(40);expect(bars.every(node=>(node.props.style as {height:string}).height==='4px')).toBe(true);expect(text(tree)).not.toMatch(/预览动效|倒计时|学习计时/);
});
it('resumes audio within the start gesture then attaches only the captured stream after permission',async()=>{
 const f=setup();f.click('开始录音');expect(f.order).toEqual(['resume','permission']);f.grant();await settle();const tree=f.render();expect(f.context.createMediaStreamSource).toHaveBeenCalledExactlyOnceWith(f.stream);expect(f.getUserMedia).toHaveBeenCalledTimes(1);expect(text(tree)).toContain('正在录音');const bars=nodes(tree).filter(node=>node.props['data-recording-bar']!==undefined);expect(bars).toHaveLength(40);expect(bars.every(node=>(node.props.style as {height:string}).height==='47.75px')).toBe(true);
 f.props.disabled=true;expect(f.button('停止并保存').props.disabled).not.toBe(true);f.click('停止并保存');expect(f.context.close).toHaveBeenCalledTimes(1);await settle();expect(store.save).toHaveBeenCalledWith(expect.objectContaining({owner:'guest',cardId:'card',moduleId:'module'}));expect(f.trackStop).toHaveBeenCalled();
});
it('cancels prepared metering before a late permission grant without attaching a source',async()=>{
 const f=setup();f.click('开始录音');f.click('取消请求');expect(f.context.close).toHaveBeenCalledTimes(1);f.grant();await settle();expect(f.trackStop).toHaveBeenCalled();expect(f.context.createMediaStreamSource).not.toHaveBeenCalled();expect(text(f.render())).not.toContain('正在录音');
});
it('keeps recording and saving usable when Web Audio is unavailable',async()=>{
 const f=setup();vi.stubGlobal('window',{isSecureContext:true});f.click('开始录音');f.grant();await settle();expect(f.media.state).toBe('recording');expect(text(f.render())).toContain('声音条纹暂不可用，录音仍在进行');f.click('停止并保存');await settle();expect(store.save).toHaveBeenCalledTimes(1);
});
it('cleans metering immediately on background and still saves the recorded blob',async()=>{
 const f=setup();f.click('开始录音');f.grant();await settle();f.render();f.document.hidden=true;f.listeners.get('visibilitychange')?.();expect(f.context.close).toHaveBeenCalledTimes(1);await settle();expect(store.save).toHaveBeenCalledTimes(1);
});
it('cleans metering and releases busy state immediately on recorder error',async()=>{
 const f=setup();f.click('开始录音');f.grant();await settle();f.render();f.media.onerror?.();expect(f.context.close).toHaveBeenCalledTimes(1);expect(f.trackStop).toHaveBeenCalled();expect(text(f.render())).toContain('录音中断');expect(f.props.onBusyChange).toHaveBeenLastCalledWith(false);
});
it('closes prepared context on unmount and rejects late permission attachment',async()=>{
 const f=setup();f.click('开始录音');hooks.cleanups.splice(0).forEach(cleanup=>cleanup());expect(f.context.close).toHaveBeenCalledTimes(1);f.grant();await settle();expect(f.context.createMediaStreamSource).not.toHaveBeenCalled();expect(f.trackStop).toHaveBeenCalled();
});
it('releases microphone and meter even if stopping a removed device throws',async()=>{
 const f=setup();f.click('开始录音');f.grant();await settle();f.render();f.media.stop=()=>{throw new Error('device removed')};f.click('停止并保存');await settle();expect(f.context.close).toHaveBeenCalledTimes(1);expect(f.trackStop).toHaveBeenCalled();expect(text(f.render())).toContain('device removed');expect(f.props.onBusyChange).toHaveBeenLastCalledWith(false);
});
