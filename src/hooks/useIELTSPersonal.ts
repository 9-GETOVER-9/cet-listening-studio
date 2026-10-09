import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { assignPersonalGroups, readPersonalWords, type PersonalWord } from '@/lib/ieltsPersonal'
import type { IELTSCorpus } from '@/lib/ieltsDictation'

export function useIELTSPersonal(owner:string,retainedAudio:readonly string[]) {
 const data=useLiveQuery(async()=>{try{return {words:await readPersonalWords(owner),error:''}}catch{return {words:[] as PersonalWord[],error:'无法读取个人生词，请检查浏览器存储权限。'}}},[owner])
 const [corpus,setCorpus]=useState<IELTSCorpus|null>(null)
 const urls=useRef(new Map<string,string>())
 const groups=useRef(new Map<string,number>())
 useEffect(()=>{
  let cancelled=false
  void Promise.resolve().then(()=>{
   if(cancelled||!data)return
   const labels=[...new Set(data.words.map(w=>w.groupLabel))].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}))
   const groupLabels=assignPersonalGroups(labels,groups.current)
   const liveKeys=new Set<string>()
   const url=(key:string,blob:Blob|undefined,path:string|undefined)=>{
    if(!blob)return path??''
    liveKeys.add(key)
    let value=urls.current.get(key);if(!value){value=URL.createObjectURL(blob);urls.current.set(key,value)}return value
   }
   const next:IELTSCorpus={version:'personal-v1',source:'个人生词',groupLabels,
    cards:data.words.map(w=>({id:w.id,chapter:groups.current.get(w.groupLabel)!,section:'生词',word:w.word,answers:w.answers,chinese:w.chinese,
     audio:url(`${w.key}:${w.addedAt}:en`,w.audioData,w.audio),chineseAudio:url(`${w.key}:${w.addedAt}:zh`,w.chineseAudioData,w.chineseAudio)||undefined,sourceBook:w.sourceBook,sourceLabel:w.sourceLabel})),tracks:[]}
   const retained=new Set(retainedAudio)
   urls.current.forEach((value,key)=>{if(!liveKeys.has(key)&&!retained.has(value)){URL.revokeObjectURL(value);urls.current.delete(key)}})
   setCorpus(next)
  })
  return()=>{cancelled=true}
 },[data,retainedAudio])
 useEffect(()=>{const cache=urls.current;return()=>{cache.forEach(value=>URL.revokeObjectURL(value));cache.clear()}},[])
 return {corpus,words:data?.words??[],error:data?.error??''}
}
