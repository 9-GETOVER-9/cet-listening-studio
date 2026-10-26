export interface JiufenCard {
 key: string; title?: string; prompt?: string; context?: string; instruction?: string; groupTitle?: string; groupSubtitle?:string; type?:string;
 note?:string; source?: {partNum?:string;questionIds?:string[];numbers?:string[]}; options?:{value:string;label:string}[];
 sentences?: {index:string;text:string;translation?:string}[]; rightAnswer?: unknown;
 clip?: {url:string;start:number;end:number}; manualClip?:{start:number;end:number}; audioUrl?:string;
 memory?:Record<string,unknown>; history?:unknown[]; deletedAt?:string
}
export interface JiufenSession {
 day:string; queue:{key:string;dueAt?:number}[]; occurrence:{id:number;played:boolean;revealed:boolean;everRevealed:boolean;translationRevealed:boolean;grade:unknown};
 replay:{speed:number;loop:boolean;position:number}; [key:string]:unknown
}
export interface JiufenLibrary {
 cards:JiufenCard[]; questionNotes:Record<string,{content:string;bridgePending?:boolean}>; session?:JiufenSession|null; bridgeSync?:Record<string,unknown>; [key:string]:unknown
}
export interface JiufenCore {
 dayKey():string;
 createSession(cards:JiufenCard[],limit:null):JiufenSession;
 restoreSession(saved:JiufenSession|null|undefined,cards:JiufenCard[]):JiufenSession|null;
 assessSentence(card:JiufenCard,session:JiufenSession,rating:string,options?:{occurrenceId:number}):{accepted:boolean;reason?:string;card:JiufenCard;session:JiufenSession};
 advanceSentence(session:JiufenSession):JiufenSession;
 previewSentence(card:JiufenCard,rating:string):{label:string};
 sentenceAudioClip(card:JiufenCard):{url:string;start:number;end:number}|null;
 reviewAnswerLabels(card:JiufenCard):string[];
 sentenceAnswerRuns(card:JiufenCard,text:string):{text:string;answer:boolean}[];
 deleteReviewCard(library:JiufenLibrary,key:string):JiufenLibrary;
 restoreReviewCard(library:JiufenLibrary,key:string):JiufenLibrary;
}
export interface JiufenSyncEngine {run():Promise<unknown>;resolve(key:string,choice:'remote'|'local'):Promise<unknown>;dispose():void}
export interface JiufenSyncModule {
 applyJiufenCommit(library:JiufenLibrary,meta:unknown,updates:unknown,options?:{deferKeys:string[]}):JiufenLibrary;
 applyJiufenIncoming(library:JiufenLibrary):JiufenLibrary;
 createJiufenSync(options:{sourceOwner:string;load:()=>Promise<JiufenLibrary>;commit:(meta:unknown,updates:unknown)=>Promise<void>;exchange:(payload:Record<string,unknown>)=>Promise<unknown>;onStatus?:(status:unknown)=>void}):JiufenSyncEngine
}
export async function loadJiufenModules():Promise<{core:JiufenCore;sync:JiufenSyncModule}> {
 const coreUrl='/assets/jiufen/review-core.mjs', syncUrl='/assets/jiufen/jiufen-sync.mjs'
 const [core,sync]=await Promise.all([import(/* @vite-ignore */ coreUrl),import(/* @vite-ignore */ syncUrl)])
 return {core,sync}
}
