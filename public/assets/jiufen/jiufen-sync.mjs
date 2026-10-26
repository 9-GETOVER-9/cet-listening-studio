// Shared by the desktop and website. No credentials or transport-specific storage.
import {newMemory,dayKey} from './review-core.mjs';
const clone=value=>value===undefined?undefined:structuredClone(value);
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const kinds=new Set(['content','memory','note','deleted']);
export const jiufenKey=(owner,kind,id)=>`jiufen/${encodeURIComponent(owner)}/${kind}/${encodeURIComponent(id)}`;
export function parseJiufenKey(key){try{const p=key.split('/');if(p.length!==4||p[0]!=='jiufen'||!kinds.has(p[2]))return null;return {sourceOwner:decodeURIComponent(p[1]),kind:p[2],id:decodeURIComponent(p[3])};}catch{return null;}}
const blankNote=value=>!String(value?.content??'').trim();
function initialNotePreference(key,local,remote,reason='initial'){
 if(reason!=='initial'||parseJiufenKey(key)?.kind!=='note')return null;
 const localBlank=blankNote(local),remoteBlank=blankNote(remote);
 return localBlank===remoteBlank?null:(localBlank?'remote':'local');
}
const contentFields=['key','title','type','unordered','source','rightAnswer','options','sentences','clip','audioUrl','manualClip','imageUrl'];
export function collectJiufenRecords(sourceOwner,library){
 const records=new Map();
 for(const card of library.cards||[]){
  if(!card?.key)continue;const content={};for(const f of contentFields)if(card[f]!==undefined)content[f]=clone(card[f]);
  records.set(jiufenKey(sourceOwner,'content',card.key),content);
  records.set(jiufenKey(sourceOwner,'memory',card.key),{memory:clone(card.memory),history:clone(card.history||[])});
  records.set(jiufenKey(sourceOwner,'deleted',card.key),{deletedAt:card.deletedAt||null});
  const ids=card.source?.questionIds||[];
  if(ids.length===1&&!library.questionNotes?.[ids[0]])records.set(jiufenKey(sourceOwner,'note',String(ids[0])),{content:String(card.note||'')});
  else if(ids.length!==1&&card.note!==undefined)records.set(jiufenKey(sourceOwner,'note','card:'+card.key),{content:String(card.note||'')});
 }
 for(const [id,row]of Object.entries(library.questionNotes||{}))records.set(jiufenKey(sourceOwner,'note',id),{content:String(row.content||'')});
 return records;
}
function applyRecord(data,key,value){
 const p=parseJiufenKey(key);if(!p)return;let card=data.cards.find(c=>c.key===p.id);
 if(p.kind==='content'){
  if(!value)return;const safe={};for(const f of contentFields)if(value[f]!==undefined)safe[f]=clone(value[f]);
  if(card){for(const f of contentFields)if(!(f in safe))delete card[f];Object.assign(card,safe);}else data.cards.push({...safe,key:p.id,memory:newMemory(dayKey()),history:[]});
 }else if(p.kind==='memory'){if(card&&value?.memory){card.memory=clone(value.memory);card.history=clone(value.history||[]);}}
 else if(p.kind==='deleted'){if(card){if(value?.deletedAt)card.deletedAt=value.deletedAt;else delete card.deletedAt;}}
 else if(p.kind==='note'){
  const content=String(value?.content||'');if(p.id.startsWith('card:')){card=data.cards.find(c=>c.key===p.id.slice(5));if(card)card.note=content;}
  else {data.questionNotes??={};const old=data.questionNotes[p.id]||{};data.questionNotes[p.id]={...old,content,...(old.content!==content?{bridgePending:true}:{})};for(const c of data.cards)if(c.source?.questionIds?.length===1&&String(c.source.questionIds[0])===p.id)c.note=content;}
 }
}
export function applyJiufenCommit(library,meta,updates,{deferKeys=[]}={}){
 const data=clone(library);data.cards??=[];data.bridgeSync=clone(meta);data.bridgeSync.records??={};
 const originals=new Map();for(const update of updates){const p=parseJiufenKey(update.key);if(p&&!originals.has(p.sourceOwner))originals.set(p.sourceOwner,collectJiufenRecords(p.sourceOwner,library));}
 const order={content:0,memory:1,note:2,deleted:3};updates=[...updates].sort((a,b)=>(order[parseJiufenKey(a.key)?.kind]??9)-(order[parseJiufenKey(b.key)?.kind]??9));
 for(const update of updates){const p=parseJiufenKey(update.key);if(!p)continue;const row=data.bridgeSync.records[update.key]??={},current=originals.get(p.sourceOwner)?.get(update.key)??null;
  if(deferKeys.includes(update.key)&&!update.ownAck&&!same(current,update.value)){row.incoming={value:clone(update.value),expected:clone(current)};row.observed=clone(current);continue;}
  if(!same(current,update.expected)&&!same(current,update.value)){
   if(update.ownAck){row.observed=clone(update.value);continue;}
   row.conflict={local:clone(current),remote:clone(update.value),reason:'concurrent'};row.pending=null;row.observed=clone(current);continue;
  }
  if(!update.ownAck)applyRecord(data,update.key,update.value);row.observed=clone(update.value);delete row.incoming;
 }
 return data;
}
export function applyJiufenIncoming(library){
 const data=clone(library),updates=[];for(const [key,row]of Object.entries(data.bridgeSync?.records||{}))if(row.incoming){updates.push({key,value:row.incoming.value,expected:row.incoming.expected});delete row.incoming;}
 return applyJiufenCommit(data,data.bridgeSync||{},updates);
}
export function createJiufenSync({sourceOwner,load,commit,exchange,onStatus=()=>{}}){
 let running=null,disposed=false;const valid=key=>parseJiufenKey(key)?.sourceOwner===sourceOwner;
 async function cycle(){
  const data=await load();if(disposed)return;const local=collectJiufenRecords(sourceOwner,data),meta=clone(data.bridgeSync||{});meta.records??={};meta.cursor??=0;const updates=[];
  const pendingFor=(key,value,row)=>({key,value:clone(value),baseVersion:row.version||0,mutationId:globalThis.crypto.randomUUID(),modifiedAt:Date.now()});
  for(const [key,value]of local){const row=meta.records[key]??={version:0,remote:null,observed:null};
   if(row.conflict){row.conflict.local=clone(value);const preference=initialNotePreference(key,row.conflict.local,row.conflict.remote,row.conflict.reason);
    if(preference==='remote'){const remote=clone(row.conflict.remote);row.conflict=null;row.pending=null;row.observed=clone(remote);updates.push({key,value:remote,expected:clone(value)});continue;}
    if(preference==='local'){row.conflict=null;row.pending=pendingFor(key,value,row);row.observed=clone(value);continue;}
    continue;
   }if(row.incoming)continue;
   if(!same(value,row.observed)){if(!row.pending||!same(value,row.pending.value))row.pending=pendingFor(key,value,row);row.observed=clone(value);}
  }
  for(const [key,row]of Object.entries(meta.records)){if(local.has(key)||!row.conflict)continue;const preference=initialNotePreference(key,row.conflict.local,row.conflict.remote,row.conflict.reason);
   if(preference==='remote'){const remote=clone(row.conflict.remote);row.conflict=null;row.pending=null;row.observed=clone(remote);updates.push({key,value:remote,expected:null});}
   else if(preference==='local'){const value=clone(row.conflict.local);row.conflict=null;row.pending=pendingFor(key,value,row);row.observed=clone(value);}
  }
  // Save outbox before any network work, so an offline attempt survives restart.
  await commit(meta,updates.splice(0));onStatus({phase:'syncing'});
  let more=true;
  while(more&&!disposed){const response=await exchange({changes:[],cursor:meta.cursor});if(disposed)return;const previous=meta.cursor;
   if(!Array.isArray(response.records)||!Number.isInteger(response.cursor)||response.cursor<previous)throw Error('Invalid sync response');
   for(const remote of response.records){if(!valid(remote.key))continue;const row=meta.records[remote.key]??={version:0,remote:null,observed:local.get(remote.key)??null};const current=local.get(remote.key)??null,changed=!same(remote.value,row.remote),pending=row.pending;
    if(pending&&same(pending.value,remote.value)){row.pending=null;row.conflict=null;}
    else if(changed&&pending){const reason=row.version?'concurrent':'initial',preference=initialNotePreference(remote.key,pending.value,remote.value,reason);
     if(preference==='remote'){updates.push({key:remote.key,value:clone(remote.value),expected:clone(current)});row.pending=null;row.conflict=null;row.observed=clone(remote.value);}
     else if(preference==='local'){row.pending={...pending,baseVersion:remote.version,mutationId:globalThis.crypto.randomUUID(),modifiedAt:Date.now()};row.conflict=null;}
     else {row.conflict={local:clone(pending.value),remote:clone(remote.value),reason};row.pending=null;}
    }
    else if(changed&&row.incoming){row.incoming.value=clone(remote.value);}
    else if(changed&&!row.conflict)updates.push({key:remote.key,value:clone(remote.value),expected:clone(current)});
    row.version=remote.version;row.remote=clone(remote.value);if(row.conflict)row.conflict.remote=clone(remote.value);
   }
   meta.cursor=response.cursor;more=!!response.more;if(more&&meta.cursor===previous)throw Error('Sync cursor did not advance');
  }
  await commit(meta,updates);if(disposed)return;
  // Reload after pull; commit may have kept a concurrently edited field as a conflict.
  const fresh=await load(),state=clone(fresh.bridgeSync||meta);const changes=Object.values(state.records||{}).filter(r=>r.pending&&!r.conflict&&!r.incoming).map(r=>r.pending);
  for(let offset=0;offset<changes.length&&!disposed;offset+=100){const batch=changes.slice(offset,offset+100),response=await exchange({changes:batch,cursor:state.cursor||0});if(disposed)return;const ackUpdates=[];
   for(const ack of response.acks||[]){const sent=batch.find(c=>c.mutationId===ack.mutationId);if(!sent)continue;const row=state.records[sent.key],remote=ack.record;
    if(ack.status==='accepted'&&remote){row.version=remote.version;row.remote=clone(remote.value);row.pending=null;row.conflict=null;ackUpdates.push({key:sent.key,value:clone(remote.value),expected:clone(sent.value),ownAck:true});}
    else if(ack.status==='conflict'){row.version=remote?.version||0;row.remote=clone(remote?.value??null);row.conflict={local:clone(sent.value),remote:clone(remote?.value??null),reason:'concurrent'};row.pending=null;}
   }
   // Do not advance cursor over response records we have not applied. Next pull consumes them.
   await commit(state,ackUpdates);
  }
  const final=clone((await load()).bridgeSync||state);final.lastSyncedAt=Date.now();await commit(final,[]);onStatus({phase:Object.values(final.records||{}).some(r=>r.conflict)?'conflict':'synced',lastSyncedAt:final.lastSyncedAt});
 }
 return {run(){if(disposed)return Promise.resolve();if(running)return running;running=cycle().catch(error=>{onStatus({phase:'error',message:error?.message||'同步失败，草稿保留'});throw error;}).finally(()=>{running=null;});return running;},
  async resolve(key,choice){if(!valid(key)||!['remote','local'].includes(choice))throw Error('Invalid conflict choice');await running;const data=await load(),meta=clone(data.bridgeSync||{}),row=meta.records?.[key];if(!row?.conflict)return;
   if(choice==='local'&&parseJiufenKey(key).kind==='memory'&&row.conflict.reason!=='initial')throw Error('评分冲突请接续云端进度后重新确认，不能覆盖旧评分');
   const current=collectJiufenRecords(sourceOwner,data).get(key)??null,value=choice==='remote'?row.conflict.remote:current;row.conflict=null;row.pending=choice==='local'?{key,value:clone(value),baseVersion:row.version||0,mutationId:globalThis.crypto.randomUUID(),modifiedAt:Date.now()}:null;row.observed=clone(value);
   await commit(meta,choice==='remote'?[{key,value,expected:current}]:[]);
  },dispose(){disposed=true;}};
}
