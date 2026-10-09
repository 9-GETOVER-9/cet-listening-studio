// Runs only in an isolated local browser; exports personal fixture data into TEMP.
const {execFileSync}=require('node:child_process')
const {writeFileSync}=require('node:fs')
const {join}=require('node:path')
const assert=require('node:assert/strict')
const origin=process.argv[2]||'http://127.0.0.1:5189'
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname))
const binary=join(process.env.USERPROFILE,'.gstack/repos/gstack/browse/dist/browse.exe')
const run=(...args)=>execFileSync(binary,args,{encoding:'utf8',timeout:30000,env:{...process.env,BROWSE_PARENT_PID:'0'}}).trim()
const js=e=>run('js',e),sleep=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
async function until(expr,ms=12000){const end=Date.now()+ms;while(Date.now()<end){if(js(`Boolean(${expr})`)==='true')return;await sleep(150)}throw Error(`Timed out: ${expr}`)}
const click=text=>run('click',`button:text-is("${text}")`)
const dbCount=()=>Number(js(`new Promise((resolve,reject)=>{const r=indexedDB.open('ielts-personal-vocabulary');r.onsuccess=()=>{const d=r.result,q=d.transaction('words').objectStore('words').count();q.onsuccess=()=>{resolve(q.result);d.close()};q.onerror=()=>reject(q.error)}})`))
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name)}
async function main(){
 run('goto',`${origin}/ielts`);run('wait','button:text-is("不熟词随身听")');run('console','--clear')
 if(js(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('跳过引导'))`)==='true')click('跳过引导')
 click('不熟词随身听');await until(`document.querySelector('input[type="file"]')&&!document.querySelector('input[type="file"]').disabled`)
 await check('real APKG import and repeated import deduplication',async()=>{
  run('upload','input[aria-label="导入个人生词文件"]',join(process.env.TEMP,'ielts-personal-540-20261007.apkg'))
  await until(`document.body.innerText.includes('导入完成：')&&!document.querySelector('input[type="file"]').disabled`,30000)
  assert.equal(dbCount(),540)
  run('upload','input[aria-label="导入个人生词文件"]',join(process.env.TEMP,'ielts-personal-540-20261007.apkg'))
  await until(`document.body.innerText.includes('新增 0 词')`,30000);assert.equal(dbCount(),540)
  assert(js(`document.body.innerText.includes('中文配音已齐全')`)==='true')
 })
 await check('personal bilingual playback, rate, pause and group switch',async()=>{
  click('随身听');run('select','select[aria-label="播放速度"]','1.25');click('播放随身听')
  await until(`document.querySelector('audio').src.includes('/ielts-zh/')&&document.querySelector('audio').currentTime>0`)
  assert.equal(Number(js(`document.querySelector('audio').playbackRate`)),1.25)
  click('暂停随身听');const src=js(`document.querySelector('audio').src`);await sleep(3000)
  assert.equal(js(`document.querySelector('audio').src`),src);assert.equal(js(`document.querySelector('audio').paused`),'true')
  run('click','button:has-text("雅思高频 · Unit 2")');await until(`document.querySelector('audio').paused`)
 })
 await check('network chapter counts and mark independent of dictation result',async()=>{
  click('网络雅思语料库');await until(`document.body.textContent.includes('第 11 章 1556')`)
  for(const label of ['第 3 章 564','第 4 章 225','第 5 章 1443','第 8 章 359'])assert(js(`document.body.textContent.includes(${JSON.stringify(label)})`)==='true')
  click('听写测试');run('click','button:has-text("开始听写")');run('wait','button:text-is("不会，查看答案")');click('不会，查看答案')
  click('标为不熟 · 加入生词库');await until(`document.body.innerText.includes('已标记不熟')`);assert.equal(dbCount(),541)
  assert(js(`document.body.innerText.includes('系统判定：不通过')`)==='true')
  click('已标记不熟 · 取消标注');await until(`document.body.innerText.includes('标为不熟 · 加入生词库')`);assert.equal(dbCount(),540)
  click('通过 / 会');run('wait','button:text-is("不会，查看答案")');click('不会，查看答案');click('不通过 / 不会');click('结束本轮')
  await until(`document.body.innerText.includes('成绩已保存')`);assert(js(`document.querySelector('section[aria-label="听写结果"]').innerText.includes('50%')`)==='true')
 })
 await check('personal dictation logs and refresh persist',async()=>{
  click('不熟词随身听');click('听写测试');run('click','button:has-text("开始听写")');run('wait','button:text-is("不会，查看答案")')
  click('不会，查看答案');click('通过 / 会');run('wait','button:text-is("不会，查看答案")');click('不会，查看答案');click('不通过 / 不会');click('结束本轮')
  await until(`document.body.innerText.includes('成绩已保存')`)
  assert(js(`document.querySelector('section[aria-label="听写成绩日志"]').innerText.includes('个人生词')`)==='true')
  run('reload');run('wait','button:text-is("不熟词随身听")');click('不熟词随身听');await until(`document.body.innerText.includes('我的不熟词 · 540')`)
  assert.equal(dbCount(),540);assert(js(`document.querySelector('section[aria-label="听写成绩日志"]').innerText.includes('50%')`)==='true')
 })
 await check('JSON export re-import retains all words without duplicate',async()=>{
  js(`window.__anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.__exportHref=this.href}`)
  click('导出 JSON');await until(`window.__exportHref`)
  run('js',`fetch(window.__exportHref).then(r=>r.text())`,'--out',join(process.env.TEMP,'qa-ielts-export.json'),'--raw')
  js(`HTMLAnchorElement.prototype.click=window.__anchorClick;delete window.__anchorClick;delete window.__exportHref`)
  run('upload','input[aria-label="导入个人生词文件"]',join(process.env.TEMP,'qa-ielts-export.json'));await until(`document.body.innerText.includes('新增 0 词')`)
  assert.equal(dbCount(),540)
 })
 await check('375px layout has no horizontal overflow',async()=>{
  run('viewport','375x812');await sleep(300);assert(js(`document.documentElement.scrollWidth<=innerWidth`)==='true')
  run('screenshot','--viewport','docs/ielts-personal-mobile.png');run('viewport','1280x900')
 })
 const errors=run('console','--errors');assert(errors.includes('(no console errors)'),errors)
 writeFileSync('docs/ielts-personal-browser-results.json',JSON.stringify({origin,results,consoleErrors:[],fixtureWords:540},null,2))
 console.log('DONE',results.length)
}
main().catch(e=>{console.error(e);process.exitCode=1})
