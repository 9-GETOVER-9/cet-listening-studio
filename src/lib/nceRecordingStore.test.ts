import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
const modules = import.meta.glob('./nceRecordingStore.ts');
async function api() { expect(modules['./nceRecordingStore.ts']).toBeDefined(); return await modules['./nceRecordingStore.ts']() as typeof import('./nceRecordingStore'); }
it('persists audio across reopen, isolates accounts and sentences, and scopes deletion', async () => {
 const p = await api(); await p.recordingDb.delete(); await p.recordingDb.open();
 const row = {id:'test',owner:'a',cardId:'c',moduleId:'m',createdAt:1,durationMs:200,blob:new Blob(['voice'],{type:'audio/webm'})};
 await p.saveRecording(row); p.recordingDb.close(); await p.recordingDb.open();
 expect((await p.listRecordings('a','c'))[0].blob.size).toBe(5);
 expect(await p.listRecordings('b','c')).toEqual([]); expect(await p.listRecordings('a','other')).toEqual([]);
 await p.deleteRecording('b','c','test'); expect(await p.listRecordings('a','c')).toHaveLength(1);
 await p.deleteRecording('a','c','test'); expect(await p.listRecordings('a','c')).toEqual([]);
 await expect(p.saveRecording({...row,blob:new Blob([])})).rejects.toThrow();
});
