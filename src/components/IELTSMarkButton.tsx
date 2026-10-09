import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/button'
import { importPersonalWords, normalizeWord, personalDB, personalWordInput, removePersonalWord } from '@/lib/ieltsPersonal'
import type { IELTSCard, IELTSBook } from '@/lib/ieltsDictation'

export function IELTSMarkButton({card,book,owner,groupLabel}:{card:IELTSCard;book:IELTSBook;owner:string;groupLabel:string}) {
 const key=normalizeWord(card.word)
 const saved=useLiveQuery(async()=>{try{return {marked:!!await personalDB.words.get([owner,key]),error:false}}catch{return {marked:false,error:true}}},[owner,key])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function toggle(){
  if(!saved||saved.error||busy)return
  setBusy(true);setError('')
  try{
   if(saved.marked)await removePersonalWord(owner,key)
   else if(book!=='personal')await importPersonalWords(owner,[personalWordInput(card,book,groupLabel)])
  }catch{setError('标注未保存，请检查浏览器存储后重试。')}finally{setBusy(false)}
 }
 return <div className="mt-4">
  <Button type="button" variant="outline" disabled={busy||!saved||saved.error||(book==='personal'&&!saved.marked)} onClick={()=>void toggle()}>{saved?.marked?'已标记不熟 · 取消标注':'标为不熟 · 加入生词库'}</Button>
  {(error||saved?.error)&&<p role="alert" className="mt-2 text-sm text-red-600">{error||'无法读取标注，请检查浏览器存储权限。'}</p>}
 </div>
}
