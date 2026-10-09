import type { PlayerState } from './ieltsPlayer'
export class IELTSWordPlayer {
 loop = true
 private queue: {audio:string;chineseAudio?:string}[] = []
 private state: PlayerState = {index:0,playing:false,error:''}
 private phase: 'english'|'gap'|'chinese'|'between' = 'english'
 private token = 0
 private rate = 1
 private timer: ReturnType<typeof setTimeout>|undefined
 private remaining = 0
 private scheduledAt = 0
 private audio:HTMLAudioElement
 private update:(s:PlayerState)=>void
 constructor(audio:HTMLAudioElement,update:(s:PlayerState)=>void){this.audio=audio;this.update=update}
 private publish(patch:Partial<PlayerState>){this.state={...this.state,...patch};this.update(this.state)}
 private cancelTimer(){
  if(this.timer!==undefined){clearTimeout(this.timer);this.timer=undefined;this.remaining=Math.max(0,this.remaining-(Date.now()-this.scheduledAt)*this.rate)}
 }
 private invalidate(){this.token++;this.cancelTimer();this.audio.onended=null;this.audio.onerror=null}
 private load(){
  const card=this.queue[this.state.index]
  this.audio.src=(this.phase==='chinese'?card?.chineseAudio:card?.audio)??''
  this.audio.currentTime=0;this.audio.load();this.audio.playbackRate=this.rate;this.audio.preservesPitch=true
 }
 setQueue(queue:{audio:string;chineseAudio?:string}[]){this.pause();this.queue=queue;this.select(0,false)}
 setRate(rate:number){
  if(!Number.isFinite(rate)||rate<0.5||rate>1.5)throw new RangeError('播放速度须在 0.5–1.5 倍之间')
  this.cancelTimer();this.rate=rate;this.audio.playbackRate=rate;this.audio.preservesPitch=true
  if(this.state.playing&&(this.phase==='gap'||this.phase==='between'))this.schedule()
 }
 private select(index:number,autoplay:boolean){
  this.invalidate();this.audio.pause();this.phase='english';this.remaining=0
  this.publish({index,playing:false,error:''});this.load();if(autoplay)void this.play()
 }
 private schedule(){
  const token=this.token;this.scheduledAt=Date.now()
  this.timer=setTimeout(()=>{
   this.timer=undefined;this.remaining=0;if(token!==this.token||!this.state.playing)return
   if(this.phase==='gap'){this.phase='chinese';this.load();this.publish({playing:false});void this.play()}
   else if(this.state.index+1<this.queue.length)this.select(this.state.index+1,true)
   else if(this.loop)this.select(0,true)
   else this.pause()
  },this.remaining/this.rate)
 }
 async play(){
  if(!this.queue.length||this.state.playing)return
  if(this.state.error)this.load()
  const token=++this.token
  this.publish({playing:true,error:''})
  if(this.phase==='gap'||this.phase==='between'){this.schedule();return}
  const fail=()=>{
   if(token!==this.token)return
   this.invalidate();this.audio.pause();this.publish({playing:false,error:'播放失败，请点击播放重试当前词。'})
  }
  this.audio.onerror=fail
  this.audio.onended=()=>{
   if(token!==this.token)return
   this.audio.onended=null;this.audio.onerror=null
   this.phase=this.phase==='english'&&this.queue[this.state.index].chineseAudio?'gap':'between'
   this.remaining=this.phase==='gap'?2500:800;this.schedule()
  }
  try{await this.audio.play();if(token!==this.token&&!this.state.playing)this.audio.pause()}catch{fail()}
 }
 pause(){this.invalidate();this.audio.pause();this.publish({playing:false})}
 next(){if(this.queue.length)this.select((this.state.index+1)%this.queue.length,this.state.playing)}
 previous(){if(this.queue.length)this.select((this.state.index+this.queue.length-1)%this.queue.length,this.state.playing)}
 dispose(){this.pause();this.queue=[];this.audio.removeAttribute?.('src');this.audio.load()}
}
