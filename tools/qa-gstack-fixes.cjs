// Run against an isolated local browser: node tools/qa-gstack-fixes.cjs [local URL].
// Requires the existing gstack browse executable; no real-account cookies are imported.
const { execFileSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const assert = require('node:assert/strict')

const origin = process.argv[2] || 'http://127.0.0.1:5187'
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Only isolated local QA is allowed')
const browser = process.env.GSTACK_BROWSE || join(process.env.USERPROFILE, '.gstack/repos/gstack/browse/dist/browse.exe')
const results = []
const run = (...args) => execFileSync(browser, args, {
  encoding: 'utf8', timeout: 30000,
  env: { ...process.env, BROWSE_PARENT_PID: '0' },
}).trim()
const js = expression => run('js', expression)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression, timeout = 4000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (js(`Boolean(${expression})`) === 'true') return true
    await sleep(150)
  }
  return false
}
async function check(name, test) {
  try { await test(); results.push({ name, passed: true }) }
  catch (error) { results.push({ name, passed: false, error: error.message }) }
  console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} ${name}`)
}

async function main() {
  // Keep the isolated test data, but avoid an older PWA worker serving a stale build.
  run('goto', origin)
  js(`navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())))`)
  run('goto', 'about:blank')
  run('goto', `${origin}/nce`)
  run('wait', '[role="radio"]:has-text("Book 1")')
  if (js(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('跳过引导'))`) === 'true') {
    run('click', 'button:has-text("跳过引导")')
  }
  run('click', '[role="radio"]:has-text("Book 2")')
  run('wait', 'h3:text-is("Lesson 01")')
  const module = `Array.from(document.querySelectorAll('h3')).find(h => h.textContent.trim() === 'Lesson 01').closest('div.cursor-pointer')`
  await check('course entry supports Tab, Enter and Space', async () => {
    assert.equal(js(`(${module}).getAttribute('role')`), 'button')
    assert.equal(js(`(${module}).tabIndex`), '0')
    js(`(${module}).focus()`)
    run('press', 'Tab')
    assert.equal(js(`document.activeElement.getAttribute('role')`), 'button')
    run('press', 'Shift+Tab')
    assert.equal(js(`document.activeElement === (${module})`), 'true')
    run('press', 'Enter')
    assert(await until(`location.pathname === '/card/NCE_Book2_Lesson01'`))
    run('goto', `${origin}/nce`)
    run('wait', '[role="radio"]:has-text("Book 2")')
    run('click', '[role="radio"]:has-text("Book 2")')
    run('wait', 'h3:text-is("Lesson 01")')
    js(`(${module}).focus()`)
    run('press', 'Space')
    assert(await until(`location.pathname === '/card/NCE_Book2_Lesson01'`))
  })

  run('goto', `${origin}/card/NCE_Book2_Lesson01`)
  run('wait', 'button:has-text("显示答案")')
  await check('lesson contains 14 sentence cards, excluding its title', async () => {
    assert.equal(js(`document.body.innerText.includes('1 / 14')`), 'true')
  })
  await check('speed responds to Enter without flipping the card', async () => {
    js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '1.25x').focus()`)
    run('press', 'Enter')
    assert.equal(js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '1.25x').classList.contains('bg-brand')`), 'true')
    assert.equal(js(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '显示答案')`), 'true')
  })
  await check('audio responds once to Enter, Space and mouse clicks', async () => {
    js(`document.querySelector('button.rounded-full').focus()`)
    run('press', 'Enter')
    assert(await until(`document.querySelector('button.rounded-full').getAttribute('aria-label') === '暂停音频'`), 'Enter did not start audio')
    run('press', 'Space')
    assert(await until(`document.body.innerText.includes('已暂停')`), 'Space did not pause audio')
    run('click', 'button.rounded-full')
    assert(await until(`document.querySelector('button.rounded-full').getAttribute('aria-label') === '暂停音频'`), 'Mouse click did not start audio')
    run('click', 'button.rounded-full')
    assert(await until(`document.body.innerText.includes('已暂停')`), 'Mouse click double-activated or did not pause audio')
    assert.equal(js(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '显示答案')`), 'true')
  })
  await check('icon controls have readable accessible names', async () => {
    for (const label of ['上一张卡片', '下一张卡片', '删除当前卡片', '播放音频']) {
      assert.equal(js(`Array.from(document.querySelectorAll('button')).some(b => b.getAttribute('aria-label') === ${JSON.stringify(label)})`), 'true', label)
    }
  })

  run('click', 'button:has-text("显示答案")')
  run('wait', 'button:has-text("认识")')
  run('click', 'button:has-text("认识")')
  assert(await until(`document.body.innerText.includes('2 /')`), 'Rating did not advance the card')
  run('goto', `${origin}/profile/stats`)
  run('wait', 'text=近 7 天学习量')
  await check('activity is labelled as activity, separately from completed days', async () => {
    const weekText = js(`Array.from(document.querySelectorAll('h3')).find(h => h.textContent === '近 7 天学习量').parentElement.parentElement.innerText`)
    assert(weekText.includes('活跃天数'), weekText)
    assert(!weekText.includes('完成天数'), weekText)
    assert.equal(js(`Array.from(document.querySelectorAll('p')).find(p => p.textContent === '活跃天数').previousElementSibling.textContent`), '1')
    assert.equal(js(`Array.from(document.querySelectorAll('p')).find(p => p.textContent === '累计完成天数').previousElementSibling.textContent`), '0')
  })
  const errors = run('console', '--errors')
  assert(errors.includes('(no console errors)'), errors)
}

main().catch(error => {
  results.push({ name: 'QA infrastructure / flow', passed: false, error: error.message })
}).finally(() => {
  writeFileSync('docs/gstack-fix-browser-results.json', JSON.stringify({ origin, results }, null, 2))
  const failures = results.filter(result => !result.passed)
  console.log(JSON.stringify(failures, null, 2))
  process.exitCode = failures.length ? 1 : 0
})
