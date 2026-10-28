export const RECORDING_BAR_COUNT = 40;
export const flatRecordingBars = () => Array<number>(RECORDING_BAR_COUNT).fill(4);

// Split the captured time-domain window into contiguous groups, including its tail.
// RMS reflects measured energy; there is no oscillator, random wave, or timer input.
export function waveformHeights(samples: Uint8Array, count = RECORDING_BAR_COUNT): number[] {
 return Array.from({length:count}, (_,i)=>{
  const start=Math.floor(i*samples.length/count), end=Math.floor((i+1)*samples.length/count);
  let energy=0;
  for(let j=start;j<end;j++){const value=(samples[j]-128)/128;energy+=value*value}
  const rms=end>start ? Math.sqrt(energy/(end-start)) : 0;
  return Math.max(4,Math.min(64,4+rms*175));
 });
}
interface MeterDependencies {
 createContext(): AudioContext | null;
 requestFrame(callback:FrameRequestCallback): number;
 cancelFrame(id:number): void;
}
const browser:MeterDependencies={
 createContext:()=>{
  if(typeof window==='undefined')return null;
  const AudioCtx=window.AudioContext || (window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  return AudioCtx ? new AudioCtx() : null;
 },
 requestFrame:callback=>requestAnimationFrame(callback),
 cancelFrame:id=>cancelAnimationFrame(id),
};
export class RecordingMeter {
 private context:AudioContext|null=null;
 private source:MediaStreamAudioSourceNode|null=null;
 private analyser:AnalyserNode|null=null;
 private samples:Uint8Array<ArrayBuffer>|null=null;
 private frame:number|null=null;
 private disposed=false;
 private onUpdate:(heights:number[],available:boolean)=>void;
 private dependencies:MeterDependencies;
 constructor(onUpdate:(heights:number[],available:boolean)=>void,dependencies:MeterDependencies=browser) {this.onUpdate=onUpdate;this.dependencies=dependencies;}
 // Call directly in the Start click gesture, before awaiting microphone permission.
 prepare() {
  if(this.disposed || this.context)return;
  try {
   this.context=this.dependencies.createContext();
   if(this.context)void this.context.resume().catch(()=>{this.fail()});
  }catch{this.fail()}
 }
 attach(stream:MediaStream) {
  if(this.disposed || this.source)return;
  try {
   if(!this.context || this.context.state!=='running'){this.fail();return}
   this.source=this.context.createMediaStreamSource(stream);
   this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;
   this.samples=new Uint8Array(this.analyser.fftSize);
   this.source.connect(this.analyser);
   // Intentionally no connection to context.destination: microphone audio stays silent.
   this.tick();
  }catch{this.fail()}
 }
 private tick=()=>{
  this.frame=null;
  if(this.disposed)return;
  try {
   if(this.context?.state!=='running' || !this.analyser || !this.samples){this.fail();return}
   this.analyser.getByteTimeDomainData(this.samples);
   this.onUpdate(waveformHeights(this.samples),true);
   this.frame=this.dependencies.requestFrame(this.tick);
  }catch{this.fail()}
 };
 private fail() {
  if(this.disposed)return;
  this.dispose();this.onUpdate(flatRecordingBars(),false);
 }
 dispose() {
  if(this.disposed)return;
  this.disposed=true;
  if(this.frame!==null){try{this.dependencies.cancelFrame(this.frame)}catch{ /* Continue resource cleanup. */ }this.frame=null}
  try{this.source?.disconnect()}catch{ /* Node may already be disconnected. */ }
  try{this.analyser?.disconnect()}catch{ /* Node may already be disconnected. */ }
  const context=this.context;this.context=null;this.source=null;this.analyser=null;this.samples=null;
  try{if(context)void context.close().catch(()=>{})}catch{ /* Context may already be closed. */ }
  // The recorder owns tracks. Meter cleanup never stops or replaces the captured stream.
 }
}
