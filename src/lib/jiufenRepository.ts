import Dexie, {type Table} from 'dexie'
import type {JiufenLibrary} from './jiufenTypes'
interface LibraryRow {account:string;source:string;library:JiufenLibrary}
class JiufenDB extends Dexie {
 libraries!:Table<LibraryRow,[string,string]>
 constructor(){super('listening-studio-jiufen-private');this.version(1).stores({libraries:'[account+source],account'})}
}
const db=new JiufenDB()
export async function loadJiufenLibrary(account:string,source:string):Promise<JiufenLibrary>{
 return (await db.libraries.get([account,source]))?.library??{cards:[],questionNotes:{}}
}
export async function updateJiufenLibrary(account:string,source:string,mutate:(library:JiufenLibrary)=>JiufenLibrary):Promise<JiufenLibrary>{
 if(!account||!source)throw Error('请先登录并选择来源')
 return db.transaction('rw',db.libraries,async()=>{
  const latest=await loadJiufenLibrary(account,source),library=mutate(latest)
  await db.libraries.put({account,source,library});return library
 })
}
export function applyJiufenRating(latest:JiufenLibrary,core:import('./jiufenTypes').JiufenCore,key:string,occurrenceId:number,rating:string):JiufenLibrary{
 const current=latest.cards.find(c=>c.key===key),session=latest.session
 if(!current||!session||session.queue[0]?.key!==key||session.occurrence.id!==occurrenceId)throw Error('当前题目已更新，请重新评分')
 const result=core.assessSentence(current,session,rating,{occurrenceId})
 if(!result.accepted)throw Error('暂不能评分：'+result.reason)
 return {...latest,cards:latest.cards.map(c=>c.key===key?result.card:c),session:result.session}
}
export function advanceJiufenReview(latest:JiufenLibrary,core:import('./jiufenTypes').JiufenCore):JiufenLibrary{
 const previous=latest.session,key=previous?.queue[0]?.key
 if(!previous?.occurrence.grade||!key)return latest
 const session=core.advanceSentence(previous),completed=new Set((latest.completedKeys??[]) as string[])
 if(!session.queue.some(item=>item.key===key))completed.add(key)
 session.finishedCount=completed.size
 if(!session.queue.length)session.queue=core.createSession(latest.cards,null).queue
 return {...latest,session,completedKeys:[...completed],finishedCount:completed.size}
}
export function activeJiufenDeferKeys(source:string,library:JiufenLibrary):string[]{
 const key=library.session?.queue[0]?.key,card=library.cards.find(c=>c.key===key)
 if(!key||!card)return []
 const prefix=`jiufen/${encodeURIComponent(source)}/`
 return [...['content','memory','deleted'].map(kind=>prefix+kind+'/'+encodeURIComponent(key)),...(card.source?.questionIds??[]).map(id=>prefix+'note/'+encodeURIComponent(id)),prefix+'note/'+encodeURIComponent('card:'+key)]
}
