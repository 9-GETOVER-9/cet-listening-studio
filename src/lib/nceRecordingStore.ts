import Dexie, { type Table } from 'dexie';
export interface LocalRecording {
 id: string; owner: string; cardId: string; moduleId: string;
 createdAt: number; durationMs: number; blob: Blob;
}
// Separate from learning records: this database never enters the sync outbox.
export const recordingDb = new Dexie('nce-local-recordings');
recordingDb.version(1).stores({ recordings: 'id,[owner+cardId]' });
const recordings: Table<LocalRecording, string> = recordingDb.table('recordings');
export async function saveRecording(row: LocalRecording) {
 if (!row.blob.size) throw new Error('没有录到声音，请重新录制。');
 await recordings.add(row);
}
export async function listRecordings(owner: string, cardId: string) {
 return (await recordings.where('[owner+cardId]').equals([owner, cardId]).toArray()).sort((a,b)=>b.createdAt-a.createdAt);
}
export async function deleteRecording(owner: string, cardId: string, id: string) {
 await recordingDb.transaction('rw', recordings, async () => {
  const row = await recordings.get(id);
  if (row?.owner === owner && row.cardId === cardId) await recordings.delete(id);
 });
}
export function recordingFilename(row: LocalRecording) {
 const type = row.blob.type;
 const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('webm') ? 'webm' : 'bin';
 return `NCE-${row.cardId.replace(/[^a-z0-9_-]/gi,'_')}-${row.createdAt}.${ext}`;
}
