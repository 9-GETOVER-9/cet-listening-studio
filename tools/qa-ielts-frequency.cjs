// Mutates only isolated local QA storage, never a production account.
const {execFileSync}=require('node:child_process')
const {writeFileSync}=require('node:fs')
const {join}=require('node:path')
const assert=require('node:assert/strict')
const origin=process.argv[2]||'http://127.0.0.1:5191'
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname))
const binary=join(process.env.USERPROFILE,'.gstack/repos/gstack/browse/dist/browse.exe')
const run=(...args)=>execFileSync(binary,args,{encoding:'utf8',timeout:30000,env:{...process.env,BROWSE_PARENT_PID:'0'}}).trim()
const js=e=>run('js',e),sleep=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
async function until(expr,ms=12000){const end=Date.now()+ms;while(Date.now()<end){if(js(`Boolean(${expr})`)==='true')return;await sleep(150)}throw Error(`Timed out: ${expr}`)}
const click=text=>run('click',`button:text-is("${text}")`)
const confirm=()=>click('确认并进入下一题')
const progress=()=>JSON.parse(js(`new Promise((resolve,reject)=>{const r=indexedDB.open('ielts-frequency-progress');r.onsuccess=()=>{const d=r.result,q=d.transaction('progress').objectStore('progress').getAll();q.onsuccess=()=>{resolve(JSON.stringify(q.result));d.close()};q.onerror=()=>reject(q.error)}})`))
const history=()=>JSON.parse(js(`new Promise((resolve,reject)=>{const r=indexedDB.open('ielts-dictation-history');r.onsuccess=()=>{const d=r.result,q=d.transaction('rounds').objectStore('rounds').getAll();q.onsuccess=()=>{resolve(JSON.stringify(q.result));d.close()};q.onerror=()=>reject(q.error)}})`))
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name)}
async function reveal(answer){await until(`document.querySelector('#ielts-answer')&&!document.querySelector('#ielts-answer').disabled`);run('fill','#ielts-answer',answer);click('检查答案');await until(`document.querySelector('#ielts-answer').disabled`)}
const panel='section[aria-label="高频错词复习"]'
async function main(){
 run('goto',`${origin}/ielts`)
 await until(`document.body.textContent.includes('跳过引导')||document.body.textContent.includes('雅思高频语料库')`)
 if(js(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('跳过引导'))`)==='true')click('跳过引导')
 run('wait','button:text-is("雅思高频语料库")')
 click('雅思高频语料库');await until(`document.body.textContent.includes('未测 250 词')`);run('console','--clear')
 await check('automatic grading, per-question persistence, 50% score and wrong tag',async()=>{
  run('click','button:has-text("开始听写")');await reveal('academic')
  assert(js(`document.body.textContent.includes('系统判定：通过')`)==='true')
  assert(js(`!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='通过 / 会')`)==='true')
  confirm();await reveal('actoin');run('select','select[aria-label="本题错题原因"]','both')
  // A same-turn double click must not count/advance this confirmation twice.
  js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='确认并进入下一题');b.click();b.click()})()`)
  await until(`document.querySelector('#ielts-answer')&&!document.querySelector('#ielts-answer').disabled`)
  click('结束本轮');await until(`document.body.textContent.includes('成绩已保存到本机日志')`)
  const p=progress();assert.equal(p.length,2);assert.equal(p.reduce((n,r)=>n+r.attempts,0),2)
  assert.equal(p.filter(r=>!r.passed).length,1);assert.equal(p.find(r=>!r.passed).reason,'both')
  assert.equal(history().at(-1).accuracy,50);click('查看待复习错词')
  await until(`document.querySelector('${panel}')?.textContent.includes('1 词待复习')`)
  assert(js(`document.querySelector('${panel}').textContent.includes('action')&&!document.querySelector('${panel}').textContent.includes('academic')`)==='true')
 })
 await check('reason changes and filters preserve score and pending status',async()=>{
  for(const reason of ['pronunciation','spelling','both','unlabelled']){
   run('select','select[aria-label="action 的错题原因"]',reason)
   await until(`document.querySelector('select[aria-label="action 的错题原因"]')?.value===${JSON.stringify(reason)}&&!document.querySelector('select[aria-label="action 的错题原因"]').disabled`)
   run('select','select[aria-label="错词原因筛选"]',reason)
   assert(js(`document.querySelector('${panel}').textContent.includes('action')`)==='true')
   run('select','select[aria-label="错词原因筛选"]',reason==='both'?'spelling':'both')
   await until(`document.querySelector('${panel}').textContent.includes('这个原因下没有待复习错词')`)
   assert(js(`!document.querySelector('${panel} audio')`)==='true')
   run('select','select[aria-label="错词原因筛选"]','all')
  }
  run('select','select[aria-label="action 的错题原因"]','both');await until(`!document.querySelector('select[aria-label="action 的错题原因"]').disabled`)
  assert.equal(history().at(-1).accuracy,50);assert.equal(progress().find(r=>!r.passed).attempts,1)
 })
 await check('refresh retains progress and default test resumes at untested adult',async()=>{
  run('reload');run('wait','button:text-is("雅思高频语料库")');click('雅思高频语料库')
  await until(`document.body.textContent.includes('未测 248 词 · 已掌握 1 词 · 待复习 1 词')`)
  assert.equal(progress().find(r=>!r.passed).reason,'both')
  run('click','button:has-text("开始听写")');click('不会，查看答案')
  assert(js(`document.querySelector('section[aria-label="听写题目"]').textContent.includes('adult')`)==='true')
  click('结束本轮');assert.equal(progress().length,2)
  await until(`document.body.textContent.includes('本轮没有确认题目，不保存成绩')`)
  assert.equal(history().length,1);click('选择新一轮');click('错词复习')
 })
 await check('mistake-only bilingual walkman, speed, tag-edit stability and scope stop',async()=>{
  click('错词随身听');run('select','select[aria-label="播放速度"]','1.25');click('播放随身听')
  await until(`document.querySelector('${panel} audio').src.includes('/ielts-zh/')&&document.querySelector('${panel} audio').currentTime>0`)
  assert.equal(Number(js(`document.querySelector('${panel} audio').playbackRate`)),1.25)
  js(`window.__qaAudio=document.querySelector('${panel} audio')`)
  run('select','select[aria-label="action 的错题原因"]','spelling')
  await until(`!document.querySelector('select[aria-label="action 的错题原因"]').disabled`)
  assert(js(`document.querySelector('${panel} audio')===window.__qaAudio`)==='true')
  run('select','select[aria-label="错词原因筛选"]','pronunciation')
  await until(`!document.querySelector('${panel} audio')`);assert.equal(js('window.__qaAudio.paused'),'true');js('delete window.__qaAudio')
  run('select','select[aria-label="错词原因筛选"]','all')
 })
 await check('correct review removes pending, preserves past mistakes and adds 100% log',async()=>{
  run('click','button:has-text("错词听写")');await reveal('action');confirm()
  await until(`document.body.textContent.includes('成绩已保存到本机日志')`)
  assert.equal(history().length,2);assert.equal(history().at(-1).accuracy,100)
  const p=progress().find(r=>r.cardId==='ielts-hf-1789555633816');assert.equal(p.passed,true);assert.equal(p.mistakes,1);assert.equal(p.attempts,2)
  click('查看待复习错词');await until(`document.querySelector('${panel}').textContent.includes('0 词待复习')`)
  assert(js(`!document.querySelector('${panel} audio')`)==='true')
  click('听写测试');click('重新测验所选内容');click('不会，查看答案')
  assert(js(`document.querySelector('section[aria-label="听写题目"]').textContent.includes('academic')`)==='true')
  click('结束本轮');click('选择新一轮')
 })
 await check('other corpus manual grading remains available',async()=>{
  click('网络雅思语料库');await until(`document.body.textContent.includes('第 11 章 1556')`)
  click('听写测试');run('click','button:has-text("开始听写")');click('不会，查看答案');click('通过 / 会');click('结束本轮')
  await until(`document.body.textContent.includes('成绩已保存到本机日志')`);assert.equal(history().at(-1).accuracy,100)
  assert.equal(progress().length,2);click('雅思高频语料库')
 })
 await check('storage failure keeps current question and reason, retry saves once',async()=>{
  await until(`document.body.textContent.includes('未测 248 词')`);click('听写测试');click('重新测验所选内容')
  click('不会，查看答案');run('select','select[aria-label="本题错题原因"]','both')
  const before=progress().find(r=>r.cardId==='ielts-hf-1789555633814').attempts
  js(`window.__qaAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){const r=window.__qaAdd.apply(this,args);if(this.name==='receipts')this.transaction.abort();return r}`)
  try {
   confirm();await until(`document.body.textContent.includes('本题保存失败')`)
   assert.equal(progress().find(r=>r.cardId==='ielts-hf-1789555633814').attempts,before)
   assert.equal(js(`document.querySelector('select[aria-label="本题错题原因"]').value`),'both')
   assert.equal(js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='结束本轮').disabled`),'true')
   assert.equal(js(`document.querySelector('section[aria-label="听写题目"]').textContent.includes('第 1 /')`),'true')
  } finally {js(`IDBObjectStore.prototype.add=window.__qaAdd;delete window.__qaAdd`)}
  click('重试保存本题');await until(`document.querySelector('#ielts-answer')&&!document.querySelector('#ielts-answer').disabled`)
  assert.equal(progress().find(r=>r.cardId==='ielts-hf-1789555633814').attempts,before+1)
  click('结束本轮');await until(`document.body.textContent.includes('成绩已保存到本机日志')`);click('选择新一轮')
 })
 await check('375px layout no horizontal overflow',async()=>{
  await until(`document.body.textContent.includes('未测 248 词')`);click('错词复习')
  run('viewport','375x812');await sleep(300);assert.equal(js(`document.documentElement.scrollWidth<=innerWidth`),'true')
  run('screenshot','--viewport','docs/ielts-frequency-mobile.png');run('viewport','1280x900')
 })
 const errors=run('console','--errors');assert(errors.includes('(no console errors)'),errors)
 writeFileSync('docs/ielts-frequency-browser-results.json',JSON.stringify({origin,results,consoleErrors:[]},null,2))
 console.log('DONE',results.length)
}
main().catch(e=>{console.error(e);process.exitCode=1})
