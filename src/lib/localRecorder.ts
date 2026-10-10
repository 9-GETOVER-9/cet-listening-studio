interface RecorderDependencies {
 getStream(): Promise<MediaStream>;
 createRecorder(stream: MediaStream): MediaRecorder;
 now(): number;
 isActive?(): boolean;
}
export function recordingSupported() {
 return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}
const browser: RecorderDependencies = {
 getStream: () => navigator.mediaDevices.getUserMedia({audio:true}),
 createRecorder: stream => {
  const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
  return new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
 },
 now: () => performance.now(),
 isActive: () => !document.hidden,
};
export class LocalRecorder {
 private stream?: MediaStream;
 private recorder?: MediaRecorder;
 private chunks: Blob[] = [];
 private disposed = false;
 private startedAt = 0;
 private result?: Promise<{blob:Blob;durationMs:number}>;
 private dependencies: RecorderDependencies;
 constructor(dependencies: RecorderDependencies = browser) { this.dependencies = dependencies; }
 async start() {
  const stream = await this.dependencies.getStream();
  if (this.disposed || this.dependencies.isActive?.() === false) { stream.getTracks().forEach(track=>track.stop()); throw new Error('录音已取消。'); }
  this.stream = stream;
  try {
   const recorder = this.dependencies.createRecorder(stream); this.recorder = recorder;
   this.result = new Promise((resolve,reject)=>{
    recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
    recorder.onerror = () => { this.release(); reject(new Error('录音中断，请重新录制。')); };
    recorder.onstop = () => {
     const durationMs = Math.max(0,this.dependencies.now()-this.startedAt);
     this.release();
     const blob = new Blob(this.chunks,{type:recorder.mimeType || this.chunks[0]?.type});
     if (this.disposed || !blob.size) reject(new Error(this.disposed ? '录音已取消。' : '没有录到声音，请重新录制。'));
     else resolve({blob,durationMs});
    };
   });
   // Errors may arrive before Stop is pressed; avoid unhandled rejection.
   void this.result.catch(()=>{});
   this.startedAt = this.dependencies.now(); recorder.start();
  } catch (error) { this.release(); throw error; }
 }
 stop() {
  if (!this.result || !this.recorder) return Promise.reject(new Error('录音尚未开始。'));
  if (this.recorder.state !== 'inactive') this.recorder.stop();
  return this.result;
 }
 dispose() {
  this.disposed = true;
  if (this.recorder?.state !== 'inactive' && this.recorder) this.recorder.stop();
  this.release();
 }
 private release() { this.stream?.getTracks().forEach(track=>track.stop()); this.stream = undefined; }
}
