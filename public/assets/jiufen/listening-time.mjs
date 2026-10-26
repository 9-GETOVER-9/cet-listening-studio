// Actual listening wall time; playback rate and seeking never add media-duration seconds.
const DAY=86400000,OFFSET=8*3600000;
export const listeningDay=ms=>new Date(ms+OFFSET).toISOString().slice(0,10);
export function createListeningClock({now=Date.now,getOwner,read,write}){
 let previous=now(),owner=getOwner(),days=owner?{...read(owner)}:{},playing=new Set();
 function tick(){const end=now(),next=getOwner();if(next!==owner){owner=next;days=owner?{...read(owner)}:{};playing.clear();previous=end;return;}
  if(owner&&playing.size&&end>previous){let at=previous;while(at<end){const boundary=(Math.floor((at+OFFSET)/DAY)+1)*DAY-OFFSET,until=Math.min(end,boundary),day=listeningDay(at);days[day]=Math.max(0,Number(days[day])||0)+(until-at);at=until;}write(owner,{...days});}previous=end;
 }
 return {tick,flush(){tick();if(owner)write(owner,{...days});},set(id,active){tick();if(!owner)return;active?playing.add(id):playing.delete(id);},today(){tick();return Number(days[listeningDay(now())])||0;}};
}
let runtime;const attached=new WeakSet();
function user(){try{const u=JSON.parse(localStorage.getItem('user')||'null'),id=u?.userId??u?.id;return id==null?'':String(id);}catch{return '';}}
function format(ms){const s=Math.floor(ms/1000);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
export function bootListeningTime(){
 if(runtime)return runtime;if(typeof document==='undefined'||typeof HTMLMediaElement==='undefined')return null;
 let failed=false;const prefix='xxgg-listening-time:v1:';
 const clock=createListeningClock({getOwner:user,read:id=>{try{return JSON.parse(localStorage.getItem(prefix+id)||'{}');}catch{failed=true;return {};}},write:(id,data)=>{try{localStorage.setItem(prefix+id,JSON.stringify(data));failed=false;}catch{failed=true;}}});
 const badge=document.createElement('span');badge.className='lt-badge';badge.setAttribute('data-listening-time','');badge.title='仅统计听力音频实际播放时间，暂停、缓冲、拖动与循环间隔不计入；倍速按实际经过的时间计算。';document.body.append(badge);
 function render(){const text=`今日听力 ${format(clock.today())}${failed?' · 保存待重试':''}`;for(const node of document.querySelectorAll('[data-listening-time]')){node.textContent=text;node.hidden=!user();}}
 const media=new Set();runtime={clock,media,render};
 setInterval(()=>{for(const audio of media){if(audio.paused||audio.ended||audio.seeking||audio.readyState<3){clock.set(audio,false);media.delete(audio);}}if(failed)clock.flush();render();},1000);
 window.addEventListener('pagehide',()=>{clock.tick();render();});window.addEventListener('storage',event=>{if(event.key==='user'||event.key===null)render();});render();return runtime;
}
export function trackListeningAudio(audio){
 const app=bootListeningTime();if(!app||!audio||attached.has(audio))return audio;attached.add(audio);
 const stop=()=>{app.clock.set(audio,false);app.media.delete(audio);app.render();};
 const start=()=>{if(!audio.paused&&!audio.ended&&!audio.seeking&&audio.readyState>=3){app.clock.set(audio,true);app.media.add(audio);app.render();}};
 for(const event of ['pause','ended','waiting','seeking','emptied','error','abort'])audio.addEventListener(event,stop);
 audio.addEventListener('playing',start);audio.addEventListener('seeked',start);return audio;
}
