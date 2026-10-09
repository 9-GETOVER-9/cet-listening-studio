// Isolated local browser only; no real account sessions or credentials.
const { execFileSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const origin = process.argv[2] || 'http://127.0.0.1:5189'
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const binary = join(process.env.USERPROFILE, '.gstack/repos/gstack/browse/dist/browse.exe')
const run = (...args) => {
  if (process.env.QA_TRACE) console.log('STEP', args[0], args[0] === 'js' ? '' : args[1] ?? '')
  return execFileSync(binary, args, { encoding: 'utf8', timeout: 30000, env: { ...process.env, BROWSE_PARENT_PID: '0' } }).trim()
}
const js = expression => run('js', expression)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
async function until(expr, timeout = 10000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (js(`Boolean(${expr})`) === 'true') return; await sleep(150) }
  throw new Error(`Condition timed out: ${expr}`)
}
const records = () => JSON.parse(js(`new Promise((resolve,reject)=>{const r=indexedDB.open('listening-time');r.onsuccess=()=>{const d=r.result;const q=d.transaction('slices').objectStore('slices').getAll();q.onsuccess=()=>{resolve(JSON.stringify(q.result));d.close()};q.onerror=()=>reject(q.error)}})`))
const seconds = category => records().filter(r => r.owner === 'guest' && (!category || r.category === category)).reduce((s, r) => s + r.seconds, 0)
async function check(name, fn) {
  await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`)
}
async function playCard(category, module) {
  run('goto', `${origin}/card/${module}`)
  await until(`document.querySelector('button[aria-label="播放音频"]')`, 45000)
  const before = seconds(category)
  run('click', 'button[aria-label="播放音频"]')
  await sleep(1800)
  // A short sentence may end between a separate label check and a driver click.
  js(`document.querySelector('button[aria-label="暂停音频"]')?.click()`)
  await sleep(300)
  const delta = seconds(category) - before
  assert(delta > 0.3 && delta < 4, `${category}: ${delta}`)
  const paused = seconds(category)
  await sleep(1300)
  assert.equal(seconds(category), paused, 'paused time advanced')
}
async function main() {
  run('console', '--clear')
  run('goto', `${origin}/profile`); run('wait', 'button:has-text("登录后签到")')
  if (js(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('跳过引导'))`) === 'true') run('click', 'button:has-text("跳过引导")')
  await check('guest check-in leads to login', async () => {
    run('click', 'button:has-text("登录后签到")')
    await until(`location.pathname === '/login'`)
  })
  const cards = [
    ['nce1', 'NCE_Book1_Lesson01'], ['nce2', 'NCE_Book2_Lesson01'],
    ['nce3', 'NCE_Book3_Lesson01'], ['nce4', 'NCE_Book4_Lesson01'],
    ['cet4', 'CET4_2016.06.01_SectionA_NewsReport1'], ['cet6', 'CET6_2016.06.01_SectionA_Conversation1'],
  ]
  for (const [category, module] of cards) await check(`${category} actual playback and paused exclusion`, () => playCard(category, module))
  run('goto', `${origin}/ielts`); run('wait', 'button:text-is("随身听")'); run('click', 'button:text-is("随身听")')
  for (const [category, label] of [['wanglu', '王陆雅思语料库'], ['frequency', '雅思高频语料库']]) {
    await check(`${category} walkman tracks real time at 1.5x`, async () => {
      if (category === 'frequency') run('click', `button:text-is("${label}")`)
      run('wait', 'button:has-text("播放随身听")')
      run('select', 'select[aria-label="播放速度"]', '1.5')
      const before = seconds(category)
      run('click', 'button:has-text("播放随身听")')
      await until(`document.querySelector('audio').currentTime > 0.1`)
      await sleep(2400)
      run('click', 'button:has-text("暂停随身听")'); await sleep(300)
      const delta = seconds(category) - before
      assert(delta > 2 && delta < 4, `${category}: ${delta}`)
      const paused = seconds(category); await sleep(1500); assert.equal(seconds(category), paused)
    })
  }
  await check('IELTS dictation also records listening time', async () => {
    run('click', 'button:text-is("听写测试")'); run('wait', 'button:has-text("开始听写")')
    const before = seconds('frequency')
    run('click', 'button:has-text("开始听写")'); run('wait', '#ielts-answer')
    await sleep(2000); run('click', 'button:text-is("结束本轮")'); await sleep(300)
    assert(seconds('frequency') > before)
  })
  const expected = Math.floor(seconds())
  await check('profile and eight categories survive a reload', async () => {
    run('goto', `${origin}/profile`); run('wait', '[data-testid="listening-total"]')
    run('click', 'button:has-text("查看统计与分类时长")'); run('wait', '[data-category="wanglu"]')
    assert.equal(js(`document.querySelectorAll('[data-category]').length`), '8')
    for (const category of ['nce1','nce2','nce3','nce4','cet4','cet6','wanglu','frequency']) assert(seconds(category) > 0)
    assert.equal(js(`document.querySelector('[data-testid="listening-total"]').textContent`), `${expected} 秒`)
    run('reload'); run('wait', '[data-category="wanglu"]')
    assert.equal(Math.floor(seconds()), expected)
    for (const label of ['今日','近 7 天','近 30 天','累计']) {
      run('click', `button:text-is("${label}")`)
      assert.equal(js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).getAttribute('aria-pressed')`), 'true')
    }
  })
  await check('375px statistics fit the screen', async () => {
    run('viewport', '375x812'); await sleep(300)
    assert.equal(js(`document.documentElement.scrollWidth <= window.innerWidth`), 'true')
    run('screenshot', join(process.cwd(), 'docs/listening-time-stats-20261007.png'))
  })
  const errors = run('console', '--errors'); assert(errors.includes('(no console errors)'), errors)
}
main().catch(error => { results.push({ name: 'QA flow', passed: false, error: error.message }); console.error(error.message); process.exitCode = 1 })
  .finally(() => writeFileSync('docs/listening-time-browser-results.json', JSON.stringify({ origin, results }, null, 2)))
