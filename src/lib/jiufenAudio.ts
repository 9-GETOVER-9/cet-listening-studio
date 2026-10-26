export function segmentBoundary(position:number,clip:{start:number;end:number}):{pause?:true;seek?:number}{
 if(position<clip.start)return {seek:clip.start}
 if(position>=clip.end)return {pause:true}
 return {}
}
type SegmentAudio=EventTarget&{currentTime:number;playbackRate:number;paused:boolean;play():Promise<void>;pause():void}
export function createSegmentPlayback(player:SegmentAudio,clip:{start:number;end:number},onActive:(active:boolean)=>void=()=>{},onError:(error:unknown)=>void=()=>{}){
 let timer:ReturnType<typeof setTimeout>|undefined,gap:ReturnType<typeof setTimeout>|undefined,generation=0,disposed=false,loop=false,internalPause=false,active=false
 const clear=()=>{if(timer)clearTimeout(timer);if(gap)clearTimeout(gap);timer=gap=undefined;generation++}
 const pause=()=>{clear();active=false;player.pause();onActive(false)}
 const arm=()=>{if(timer)clearTimeout(timer);if(!disposed&&active&&!player.paused)timer=setTimeout(check,Math.max(10,(clip.end-player.currentTime)/player.playbackRate*1000))}
 const finish=()=>{
  if(disposed||!active||gap)return
  clear();internalPause=true;player.pause();internalPause=false
  if(!loop){active=false;onActive(false);return}
  const token=generation
  gap=setTimeout(()=>{gap=undefined;if(disposed||!active||!loop||token!==generation)return;player.currentTime=clip.start;void start(token)},3000)
 }
 function check(){if(disposed||!active||gap)return;if(player.currentTime>=clip.end)finish();else arm()}
 async function start(token:number){try{await player.play();if(disposed)player.pause()}catch(error){if(!disposed&&token===generation){pause();onError(error)}}}
 const playing=()=>{if(disposed)return;active=true;onActive(true);arm()}
 const nativePause=()=>{if(!internalPause&&active&&!gap&&player.paused)pause()}
 const ended=()=>finish()
 player.addEventListener('playing',playing);player.addEventListener('pause',nativePause);player.addEventListener('timeupdate',check);player.addEventListener('ended',ended)
 return {async play(restart=false){if(disposed)return;clear();active=true;if(restart||player.currentTime<clip.start||player.currentTime>=clip.end)player.currentTime=clip.start;await start(generation)},pause,
 setLoop(value:boolean){loop=value;if(!value&&gap)pause()},setRate(value:number){player.playbackRate=value;arm()},
 dispose(){disposed=true;pause();player.removeEventListener('playing',playing);player.removeEventListener('pause',nativePause);player.removeEventListener('timeupdate',check);player.removeEventListener('ended',ended)}}
}
export function createSegmentResourceGuard(clip:{start:number;end:number}){
 let ready=false,invalid=false
 return {validate(duration:number){if(invalid)return false;ready=Number.isFinite(duration)&&Number.isFinite(clip.start)&&Number.isFinite(clip.end)&&clip.start>=0&&clip.end>clip.start&&clip.end<=duration+.05;if(!ready)invalid=true;return ready},canPlay(){return ready&&!invalid},invalidate(){invalid=true;ready=false}}
}
