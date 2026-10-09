import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { IELTSCard } from '@/lib/ieltsDictation'
import { importPersonalWords, removePersonalWord, type PersonalWord } from '@/lib/ieltsPersonal'
import { exportVocabularyCSV, exportVocabularyJSON, exportVocabularyZip, parseVocabularyArchive } from '@/lib/ieltsArchive'

function download(bytes:BlobPart,type:string,name:string){
 const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a')
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000)
}
export function IELTSPersonalLibrary({owner,words,knownCards,indexError,onReload}:{owner:string;words:PersonalWord[];knownCards:IELTSCard[];indexError:string;onReload:()=>void}) {
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0)
 const alive=useRef(true)
 // Unmount on account changes prevents old asynchronous completions appearing in the new account.
 const ownerRef=useRef(owner)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function upload(file:File){
  if(busy)return;setBusy(true);setStatus('');setError('')
  try{
   if(file.size>100*1024*1024)throw new Error('文件超过 100 MB，请分批导入。')
   const parsed=await parseVocabularyArchive(new Uint8Array(await file.arrayBuffer()),file.name,knownCards)
   if(!alive.current||ownerRef.current!==owner)return
   const result=await importPersonalWords(owner,parsed.words)
   setStatus(`导入完成：新增 ${result.added} 词，已有 ${result.existing} 词，总计 ${result.total} 词。${parsed.missingChinese?`其中 ${parsed.missingChinese} 词暂无中文配音，可先听英文。`:'中文配音已齐全。'}`)
  }catch(e){setError(e instanceof Error?e.message:'导入失败，本次未保存。')}finally{setBusy(false)}
 }
 async function exportFile(kind:'csv'|'json'|'zip'){
  setBusy(true);setError('');setStatus('')
  try{
   const prefix=`雅思不熟词_${new Date().toISOString().slice(0,10)}`
   if(kind==='zip'){const bytes=await exportVocabularyZip(words);download(bytes.slice().buffer as ArrayBuffer,'application/zip',`${prefix}.zip`)}
   else if(kind==='json')download(exportVocabularyJSON(words),'application/json',`${prefix}.json`)
   else download(exportVocabularyCSV(words),'text/csv;charset=utf-8',`${prefix}.csv`)
   setStatus('已导出个人生词，可交给本地 Codex 制作 Anki APKG。')
  }catch(e){setError(e instanceof Error?e.message:'导出失败，请重试。')}finally{setBusy(false)}
 }
 const filtered=words.filter(w=>`${w.word} ${w.chinese??''} ${w.groupLabel}`.toLowerCase().includes(search.toLowerCase()))
 const pageCount=Math.max(1,Math.ceil(filtered.length/50)),currentPage=Math.min(page,pageCount-1)
 return <section className="quiet-surface p-5 md:p-8" aria-label="管理个人生词">
  <h2 className="text-xl font-semibold">我的不熟词 · {words.length} 词</h2>
  <p className="my-3 text-sm text-[var(--app-muted)]">查看听写答案时标注的词会加入这里。保存在当前浏览器，按账号区分；请定期导出备份。{owner==='guest'?'当前为访客生词。':''}</p>
  <div className="flex flex-wrap items-center gap-3">
   <label className="cursor-pointer border border-[var(--app-line)] p-3 text-sm">{busy?'正在处理…':'导入 APKG / JSON / ZIP'}
    <input aria-label="导入个人生词文件" type="file" accept=".apkg,.json,.zip" className="mt-2 block max-w-full" disabled={busy||!knownCards.length} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f)}}/>
   </label>
   {(['csv','json','zip'] as const).map(kind=><Button key={kind} variant="outline" disabled={busy||!words.length} onClick={()=>void exportFile(kind)}>导出 {kind==='zip'?'ZIP · 含本地音频':kind.toUpperCase()}</Button>)}
  </div>
  {!knownCards.length&&<div className="mt-3 text-sm"><p role={indexError?'alert':'status'}>{indexError||'正在加载可复用的中文配音索引；加载后即可导入。'}</p><Button variant="ghost" onClick={onReload}>重新加载配音索引</Button></div>}
  {status&&<p role="status" className="mt-3 text-sm">{status}</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
  {!words.length?<p className="mt-5 text-sm">先在其他语料的听写答案中标为不熟，或导入你的词包。</p>:<details className="mt-5">
   <summary className="cursor-pointer">查看 / 移出已熟词</summary>
   <input aria-label="搜索个人生词" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="搜索词、中文或来源" className="mt-3 w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3"/>
   <div className="divide-y divide-[var(--app-line)]">{filtered.slice(currentPage*50,(currentPage+1)*50).map(w=><div key={w.key} className="flex items-start justify-between gap-3 py-3">
    <div className="min-w-0"><p className="break-words font-medium">{w.word}</p><p className="break-words text-sm text-[var(--app-muted)]">{w.chinese} · {w.groupLabel}</p></div>
    <Button variant="ghost" disabled={busy} onClick={()=>{void removePersonalWord(owner,w.key).catch(()=>setError('移出失败，请重试。'))}}>移出</Button>
   </div>)}</div>
   <div className="mt-3 flex items-center gap-3"><Button variant="outline" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>上一页</Button><span className="text-sm">{currentPage+1} / {pageCount}</span><Button variant="outline" disabled={currentPage+1>=pageCount} onClick={()=>setPage(currentPage+1)}>下一页</Button></div>
  </details>}
 </section>
}
