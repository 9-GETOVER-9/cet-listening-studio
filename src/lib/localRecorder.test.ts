import { expect, it, vi } from 'vitest';
const modules = import.meta.glob('./localRecorder.ts');
async function api() { expect(modules['./localRecorder.ts']).toBeDefined(); return await modules['./localRecorder.ts']() as typeof import('./localRecorder'); }
function fixture() {
 const stopTrack=vi.fn(); const stream={getTracks:()=>[{stop:stopTrack}]} as unknown as MediaStream;
 const fake={mimeType:'audio/mp4',state:'inactive',ondataavailable:null as ((event:BlobEvent)=>void)|null,onstop:null as ((event:Event)=>void)|null,onerror:null,start(){fake.state='recording'},stop(){fake.state='inactive'; fake.ondataavailable?.({data:new Blob(['voice'])} as BlobEvent);fake.onstop?.({} as Event)}};
 const recorder=fake as unknown as MediaRecorder;
 return {stream,recorder,stopTrack};
}
it('collects final audio using actual mime and releases the microphone',async()=>{
 const p=await api();const f=fixture();let time=1;const r=new p.LocalRecorder({getStream:async()=>f.stream,createRecorder:()=>f.recorder,now:()=>time});await r.start();time=301;
 const result=await r.stop(); expect(result.blob.type).toBe('audio/mp4');expect(result.blob.size).toBe(5);expect(result.durationMs).toBe(300);expect(f.stopTrack).toHaveBeenCalled();
});
it('cancels late microphone permission without starting recording',async()=>{
 const p=await api();const f=fixture();let resolve!:(s:MediaStream)=>void;const r=new p.LocalRecorder({getStream:()=>new Promise(res=>resolve=res),createRecorder:()=>f.recorder,now:()=>1});const pending=r.start();r.dispose();resolve(f.stream);await expect(pending).rejects.toThrow();expect(f.stopTrack).toHaveBeenCalled();expect(f.recorder.state).toBe('inactive');
});
it('releases tracks on recording start failure',async()=>{
 const p=await api();const f=fixture();f.recorder.start=()=>{throw new Error('device')};const r=new p.LocalRecorder({getStream:async()=>f.stream,createRecorder:()=>f.recorder,now:()=>1});await expect(r.start()).rejects.toThrow('device');expect(f.stopTrack).toHaveBeenCalled();
});
it('does not start the microphone when permission returns to an inactive page',async()=>{
 const p=await api();const f=fixture();const r=new p.LocalRecorder({getStream:async()=>f.stream,createRecorder:()=>f.recorder,now:()=>1,isActive:()=>false});await expect(r.start()).rejects.toThrow();expect(f.stopTrack).toHaveBeenCalled();expect(f.recorder.state).toBe('inactive');
});
