import { describe, expect, it, vi } from 'vitest';

const modules=import.meta.glob('./recordingMeter.ts');
async function api() {expect(modules['./recordingMeter.ts'], 'real microphone metering must exist').toBeDefined();return await modules['./recordingMeter.ts']() as typeof import('./recordingMeter');}
function fixture() {
 let sample=128;
 let frame:FrameRequestCallback|undefined;
 const analyser={fftSize:2048,getByteTimeDomainData(data:Uint8Array){data.fill(sample)},disconnect:vi.fn()};
 const source={connect:vi.fn(),disconnect:vi.fn()};
 const context={state:'running',createAnalyser:()=>analyser,createMediaStreamSource:vi.fn(()=>source),resume:vi.fn(async()=>{}),close:vi.fn(async()=>{}),destination:{}};
 const dependencies={createContext:()=>context as unknown as AudioContext,requestFrame:vi.fn((callback:FrameRequestCallback)=>{frame=callback;return 7}),cancelFrame:vi.fn()};
 const stream={getTracks:()=>[{stop:vi.fn()}]} as unknown as MediaStream;
 return {context,source,analyser,dependencies,stream,setSample:(value:number)=>{sample=value},tick:()=>{const next=frame;frame=undefined;next?.(0)}};
}
describe('time-domain sound bars',()=>{
 it('keeps silence flat and all 40 bars within 4..64 px',async()=>{
  const p=await api();expect(p.waveformHeights(new Uint8Array(2048).fill(128))).toEqual(Array(40).fill(4));
  for(const sample of [0,1,127,128,129,255]) {const heights=p.waveformHeights(new Uint8Array(2048).fill(sample));expect(heights).toHaveLength(40);expect(heights.every(height=>height>=4&&height<=64)).toBe(true)}
 });
 it('uses measured RMS, increasing with signal energy and treating both polarities equally',async()=>{
  const p=await api();const quiet=p.waveformHeights(new Uint8Array(2048).fill(136))[0];const louder=p.waveformHeights(new Uint8Array(2048).fill(160))[0];
  expect(quiet).toBeCloseTo(4+8/128*175);expect(louder).toBeCloseTo(4+32/128*175);expect(louder).toBeGreaterThan(quiet);expect(p.waveformHeights(new Uint8Array(2048).fill(96))[0]).toBe(louder);
  expect(p.waveformHeights(new Uint8Array([128,128,160,160]),2)).toEqual([4,louder]);
  expect(p.waveformHeights(new Uint8Array([128,160]),1)[0]).toBeCloseTo(4+Math.sqrt(0.25**2/2)*175);
 });
 it('consumes every sample including a remainder and handles empty input without NaN',async()=>{
  const p=await api();expect(p.waveformHeights(new Uint8Array(0))).toEqual(Array(40).fill(4));
  expect(p.waveformHeights(new Uint8Array([128,128,128,128,160]),2)).toEqual([4,4+Math.sqrt(0.25**2/3)*175]);
 });
});
describe('meter lifecycle',()=>{
 it('creates and resumes the context synchronously before microphone attachment',async()=>{
  const p=await api();const f=fixture();const meter=new p.RecordingMeter(()=>{},f.dependencies);meter.prepare();
  expect(f.context.resume).toHaveBeenCalledTimes(1);expect(f.context.createMediaStreamSource).not.toHaveBeenCalled();meter.dispose();
 });
 it('attaches the same stream once without echo and emits actual samples on frames',async()=>{
  const p=await api();const f=fixture();const updates=vi.fn();const meter=new p.RecordingMeter(updates,f.dependencies);meter.prepare();meter.attach(f.stream);
  expect(f.context.createMediaStreamSource).toHaveBeenCalledExactlyOnceWith(f.stream);expect(f.source.connect).toHaveBeenCalledExactlyOnceWith(f.analyser);expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),true);
  f.setSample(160);f.tick();expect(updates).toHaveBeenLastCalledWith(Array(40).fill(47.75),true);f.setSample(128);f.tick();expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),true);meter.dispose();
 });
 it('cancels frames, disconnects nodes, closes context once and ignores late frames',async()=>{
  const p=await api();const f=fixture();const updates=vi.fn();const meter=new p.RecordingMeter(updates,f.dependencies);meter.prepare();meter.attach(f.stream);meter.dispose();meter.dispose();updates.mockClear();f.tick();meter.attach(f.stream);
  expect(updates).not.toHaveBeenCalled();expect(f.dependencies.cancelFrame).toHaveBeenCalledWith(7);expect(f.source.disconnect).toHaveBeenCalledTimes(1);expect(f.analyser.disconnect).toHaveBeenCalledTimes(1);expect(f.context.close).toHaveBeenCalledTimes(1);
 });
 it('cleans a prepared context on cancellation before a late permission grant',async()=>{
  const p=await api();const f=fixture();const meter=new p.RecordingMeter(()=>{},f.dependencies);meter.prepare();meter.dispose();meter.attach(f.stream);expect(f.context.close).toHaveBeenCalledTimes(1);expect(f.context.createMediaStreamSource).not.toHaveBeenCalled();
 });
 it('falls back honestly when Web Audio is unavailable without touching microphone tracks',async()=>{
  const p=await api();const f=fixture();const updates=vi.fn();const meter=new p.RecordingMeter(updates,{...f.dependencies,createContext:()=>null});meter.prepare();meter.attach(f.stream);expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),false);expect(f.dependencies.requestFrame).not.toHaveBeenCalled();
 });
 it('handles rejected resume and close promises without escaping an error',async()=>{
  const p=await api();const f=fixture();f.context.resume.mockRejectedValue(new Error('blocked'));f.context.close.mockRejectedValue(new Error('closed'));const updates=vi.fn();const meter=new p.RecordingMeter(updates,f.dependencies);meter.prepare();await Promise.resolve();meter.attach(f.stream);await Promise.resolve();expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),false);expect(f.context.close).toHaveBeenCalledTimes(1);
 });
 it('falls back and cleans resources if the context is suspended during recording',async()=>{
  const p=await api();const f=fixture();const updates=vi.fn();const meter=new p.RecordingMeter(updates,f.dependencies);meter.prepare();meter.attach(f.stream);f.context.state='suspended';f.tick();expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),false);expect(f.context.close).toHaveBeenCalledTimes(1);
 });
 it('cleans the partially connected graph if analyser attachment fails',async()=>{
  const p=await api();const f=fixture();f.source.connect.mockImplementation(()=>{throw new Error('graph')});const updates=vi.fn();const meter=new p.RecordingMeter(updates,f.dependencies);meter.prepare();meter.attach(f.stream);expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),false);expect(f.source.disconnect).toHaveBeenCalledTimes(1);expect(f.analyser.disconnect).toHaveBeenCalledTimes(1);expect(f.context.close).toHaveBeenCalledTimes(1);
 });
 it('cleans resources if waveform read fails',async()=>{
  const p=await api();const f=fixture();f.analyser.getByteTimeDomainData=()=>{throw new Error('device')};const updates=vi.fn();const meter=new p.RecordingMeter(updates,f.dependencies);meter.prepare();meter.attach(f.stream);expect(updates).toHaveBeenLastCalledWith(Array(40).fill(4),false);expect(f.context.close).toHaveBeenCalledTimes(1);
 });
});
