import {trackListeningAudio} from './listening-time.mjs';
// Additive training state. Original exam, grading, ownership and final review remain authoritative.
export const copy = value => JSON.parse(JSON.stringify(value));
const eq = (a, b) => String(a ?? '') === String(b ?? '');
export const rejectedBeforeWrite = result => (result?.submissionState ?? result?.data?.submissionState ?? result?.businessData?.submissionState ?? result?.payload?.data?.submissionState) === 'rejected_before_write';
export function initialState() {
  return {version: 1, enabled: false, stage: 'setup', first: {}, second: {}, changed: {}, grades: {}, clips: {}, payload: null, receipt: null};
}
export function trackChanges(state, answers) {
  if (!state.enabled || !['second', 'ready'].includes(state.stage)) return;
  for (const q of new Set([...Object.keys(state.first), ...Object.keys(answers)])) {
    if (!eq(answers[q], state.first[q])) state.changed[q] = true;
  }
}
export function extractGrades(review) {
  const result = {};
  const add = (q, part) => {
    const number = q.qNumber ?? q.questionNumber;
    const value = q.state ?? q.correct ?? q.isCorrect;
    if (number == null || value == null) return;
    result[String(number)] = {partId: String(part ?? ''), correct: value === true || value === 1 || value === '1' || value === 'true'};
  };
  for (const part of review?.parts ?? []) for (const group of part.groups ?? []) for (const q of group.questions ?? []) add(q, part.id);
  for (const q of review?.details ?? []) add(q, q.partId);
  return result;
}
export function sentenceClip(part, number) {
  const question = (part?.groups ?? []).flatMap(g => g.questions ?? []).find(q => String(q.qNumber) === String(number));
  let indexes = question?.sentenceIndex;
  if (typeof indexes === 'string') {
    try { indexes = JSON.parse(indexes); } catch {
      const expanded = [];
      for (const piece of indexes.split(/[,，;；\s]+/).filter(Boolean)) {
        const match = piece.match(/^(\d+)(?:[-–~](\d+))?$/);
        if (!match) return null;
        const start = Number(match[1]), end = Number(match[2] ?? match[1]);
        if (end < start || end - start > 1000) return null;
        for (let i = start; i <= end; i++) expanded.push(i);
      }
      indexes = expanded;
    }
  }
  if (!Array.isArray(indexes)) indexes = indexes == null ? [] : [indexes];
  const wanted = new Set(indexes.map(Number).filter(Number.isFinite));
  let article = part?.articleJson;
  if (typeof article === 'string') { try { article = JSON.parse(article); } catch { return null; } }
  const sentences = (article?.segments ?? []).flatMap(s => s.sentences ?? []).filter(s => wanted.has(Number(s.sentence_index)));
  if (!sentences.length || sentences.length !== wanted.size) return null;
  if (sentences.some(s => s.start_time == null || s.end_time == null || !Number.isFinite(Number(s.start_time)) || !Number.isFinite(Number(s.end_time)) || Number(s.end_time) <= Number(s.start_time))) return null;
  const start = Math.min(...sentences.map(s => Number(s.start_time)));
  const end = Math.max(...sentences.map(s => Number(s.end_time)));
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && part.audioUrl ? {start, end, url: part.audioUrl} : null;
}
function owner() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const id = String(user?.id ?? ''), userId = String(user?.userId ?? '');
    return id && userId && id !== userId ? '' : userId || id;
  } catch { return ''; }
}
// Vue rewrites native question classes when active/bookmarked state changes. Reapply only
// the missing addon attributes, so observing those rewrites cannot cause a mutation loop.
export function applyQuestionMarkers(root, state, answers, active, frozen = false) {
  const toggle = (element, name, value) => {
    if (element.classList.contains(name) !== value) element.classList.toggle(name, value);
  };
  toggle(root, 'tp-active', active);
  const panel = root.querySelector('.question-panel');
  if (panel && panel.inert !== frozen) panel.inert = frozen;
  for (const element of root.querySelectorAll('[data-q-number], [data-qnumber], [data-note-anchor], .question-number')) {
    const q = element.getAttribute('data-q-number') || element.getAttribute('data-qnumber') || element.getAttribute('data-note-anchor') || element.textContent.trim();
    toggle(element, 'tp-changed', active && !!state.changed[q]);
    const grade = active && state.stage === 'third' ? state.grades[q] : null;
    const pending = grade && !eq(answers[q], state.second[q]);
    const status = grade ? pending ? 'pending' : grade.correct ? 'correct' : 'wrong' : '';
    if ((element.getAttribute('data-tp-grade') || '') !== status) {
      if (status) element.setAttribute('data-tp-grade', status); else element.removeAttribute('data-tp-grade');
    }
  }
}
export function createThreePass(api) {
  const {ref, watch, mounted, unmounted, h} = api;
  const state = ref(initialState()), busy = ref(false), error = ref(''), clipPlaying = ref('');
  let observer, audio, disposed = false, queued = false, decorated = false;
  const current = () => !disposed && api.current();
  const save = () => api.save();
  const requireSave = () => { if (!save()) throw new Error('三遍练习草稿保存失败，请保留本页并重试。'); };
  function stopClip() {
    const player = audio;
    audio = null; clipPlaying.value = '';
    if (player) { player.pause(); player.src = ''; }
  }
  function setStage(stage) { state.value.stage = stage; save(); decorate(); }
  function decorate() {
    if (disposed || queued || typeof document === 'undefined') return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (disposed) return;
      const root = document.querySelector('.app-container--listening-exam');
      if (!root) return;
      const active = state.value.enabled && current();
      if (!active && !decorated) return;
      decorated = active;
      const frozen = active && (busy.value || !!state.value.payload && state.value.stage === 'ready');
      applyQuestionMarkers(root, state.value, api.answers(), active, frozen);
    });
  }
  watch(api.answers, value => { trackChanges(state.value, value); decorate(); }, {deep: true, flush: 'sync'});
  watch(() => api.blocked(), blocked => { if (blocked) stopClip(); decorate(); });
  mounted(() => {
    observer = new MutationObserver(decorate);
    observer.observe(document.querySelector('.app-container--listening-exam') || document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'data-q-number', 'data-qnumber', 'data-note-anchor'],
    });
    decorate();
  });
  unmounted(() => { disposed = true; observer?.disconnect(); stopClip(); });
  function enable(value) {
    if (api.started() || api.mixed() || !current()) return;
    state.value = initialState(); state.value.enabled = value; save();
  }
  function restore(value) {
    if (api.mixed() || value?.version !== 1 || !value.enabled) return;
    const valid = ['setup', 'first', 'second', 'ready', 'third'].includes(value.stage);
    if (!valid) return;
    state.value = {...initialState(), ...copy(value)};
    decorate();
  }
  function setup(options) {
    if (!state.value.enabled) return options;
    if (state.value.stage === 'setup') setStage('first');
    return {...options, mode: 'auto_audio'};
  }
  function terminal() {
    if (!state.value.enabled) return false;
    if (state.value.stage === 'first') {
      state.value.first = copy(api.answers());
      setStage('second');
      api.restart();
    } else if (state.value.stage === 'second') setStage('ready');
    return true;
  }
  async function check() {
    if (busy.value || !current() || state.value.stage !== 'ready' || api.blocked()) return;
    if (!state.value.payload && !await api.confirm({title: '核对第二遍？', message: '提交第二遍作答后只显示对错，题目仍可修改。第三遍提交后才进入完整解析。', confirmText: '提交并核对', cancelText: '继续检查', variant: 'submit'})) return;
    if (!current()) return;
    busy.value = true; error.value = ''; stopClip(); decorate();
    try {
      if (!state.value.payload) {
        state.value.second = copy(api.answers());
        state.value.payload = {...copy(api.buildPayload()), clientSubmissionId: crypto.randomUUID()};
      }
      requireSave();
      if (!state.value.receipt) {
        const response = await api.submit(copy(state.value.payload));
        if (!current()) return;
        if (!response?.success) throw Object.assign(new Error('第二遍提交失败，请重试。'), response, {message: response?.message || '第二遍提交失败，请重试。'});
        const receipt = response.data;
        const id = receipt?.resultId ?? receipt?.attemptId ?? receipt?.id;
        if (!id) throw new Error('提交响应缺少结果编号；已保留同一提交身份，请重试核对。');
        state.value.receipt = {resultId: String(id)};
        requireSave();
      }
      // A persisted receipt prevents another POST when only this GET needs retrying.
      const review = await api.review(state.value.receipt.resultId);
      if (!current()) return;
      const grades = extractGrades(review);
      const expected = state.value.payload.parts.flatMap(p => p.groups.flatMap(g => g.questions)).map(q => String(q.qNumber));
      if (!expected.length || expected.some(q => !grades[q])) throw new Error('核对结果尚不完整，请重试获取结果。');
      state.value.grades = grades;
      // Keep only timing and audio URL from review metadata, never its answer keys or transcript.
      state.value.clips = {};
      for (const part of review.parts ?? []) for (const group of part.groups ?? []) for (const q of group.questions ?? []) {
        const clip = sentenceClip(part, q.qNumber);
        if (clip) state.value.clips[String(q.qNumber)] = clip;
      }
      setStage('third');
      requireSave();
    } catch (e) {
      if (current()) {
        const rejected = !state.value.receipt && rejectedBeforeWrite(e);
        if (rejected) {
          // Only a definitive server guarantee of no write permits replacing the frozen request.
          state.value.payload = null; state.value.second = {}; save();
        }
        error.value = (e?.message || '核对失败，请重试。') + (rejected ? ' 可以修改答案后再次提交。' : '');
      }
    }
    finally { busy.value = false; decorate(); }
  }
  async function finalSubmit() {
    if (busy.value || !current() || state.value.stage !== 'third' || api.blocked()) return;
    if (!await api.confirm({title: '提交第三遍？', message: '提交当前修改后的答案，并进入原版完整解析。', confirmText: '提交第三遍', cancelText: '继续检查', variant: 'submit'})) return;
    if (!current()) return;
    stopClip();
    api.finalSubmit();
  }
  function finish() {
    if (!state.value.enabled) return false;
    if (state.value.stage === 'ready') check();
    else if (state.value.stage === 'third') finalSubmit();
    else error.value = '请完成当前录音；第二遍结束后可提交核对。';
    return true;
  }
  async function listen(q) {
    if (!current() || state.value.stage !== 'third') return;
    if (clipPlaying.value === q) { stopClip(); return; }
    stopClip(); error.value = '';
    const part = api.parts().find(p => String(p.id) === state.value.grades[q]?.partId);
    const clip = sentenceClip(part, q) || state.value.clips[q];
    if (!clip) { error.value = `第 ${q} 题没有可用的句子时间定位。`; return; }
    if (part) api.select(part.id, q);
    audio = trackListeningAudio(new Audio(api.audioUrl(clip.url)));
    const player = audio;
    const isLive = () => audio === player && current();
    player.playbackRate = 1;
    player.addEventListener('timeupdate', () => { if (isLive() && player.currentTime >= clip.end) stopClip(); });
    player.addEventListener('ended', () => { if (isLive()) stopClip(); });
    player.addEventListener('error', () => { if (isLive()) { stopClip(); error.value = '片段播放失败，请重试。'; } });
    player.addEventListener('loadedmetadata', async () => {
      if (!isLive()) return;
      player.currentTime = clip.start;
      try { await player.play(); if (isLive()) clipPlaying.value = q; else player.pause(); }
      catch { if (isLive()) { stopClip(); error.value = '片段未能播放，请再次点击点听。'; } }
    }, {once: true});
    player.load();
  }
  function completed(result) {
    if (!state.value.enabled || !current()) return;
    const id = result?.resultId ?? result?.attemptId ?? result?.id;
    const user = owner();
    if (!id || !user) return;
    const summary = {owner: user, first: state.value.first, second: state.value.second, grades: state.value.grades, changed: state.value.changed};
    try { sessionStorage.setItem(`xxgg-three-pass:${user}:${id}`, JSON.stringify(summary)); } catch { /* Original submission must remain available. */ }
  }
  function render() {
    const s = state.value;
    const button = (label, onClick, disabled = false) => h('button', {type: 'button', class: 'tp-button', onClick, disabled}, label);
    const children = [];
    if (!s.enabled) {
      if (api.started()) return null;
      children.push(h('label', {class: 'tp-toggle'}, [h('input', {type: 'checkbox', checked: false, disabled: api.mixed() || api.blocked(), onChange: e => enable(e.target.checked)}), h('span', null, '三遍听力练习')]));
      if (api.mixed()) children.push(h('span', {class: 'tp-hint'}, '组卷沿用原版流程'));
    } else {
      const labels = {setup: '三遍练习 · 确认开始后自动播放', first: '第一遍 · 1.0× 完整听写', second: '第二遍 · 自动重听 / 修改答案', ready: '第二遍完成 · 提交后仅核对对错', third: '第三遍 · 按错题点听 / 修正后提交'};
      children.push(h('strong', null, labels[s.stage]));
      if (s.stage === 'setup') children.push(button('关闭三遍练习', () => enable(false)));
      if (['second', 'ready', 'third'].includes(s.stage)) children.push(h('span', {class: 'tp-hint'}, `已修改 ${Object.keys(s.changed).length} 题 · 蓝点保留修改记录`));
      if (s.stage === 'ready') children.push(button(busy.value ? '正在核对…' : s.payload ? '重试核对' : '提交第二遍并核对', check, busy.value || api.blocked()));
      if (s.stage === 'third') {
        const wrong = Object.keys(s.grades).filter(q => !s.grades[q].correct).sort((a, b) => Number(a) - Number(b));
        children.push(h('span', {class: 'tp-hint'}, `第二遍：${Object.keys(s.grades).length - wrong.length} 对 / ${wrong.length} 错；修改后标为待核对`));
        children.push(button('提交第三遍 → 完整解析', finalSubmit, api.blocked()));
        children.push(h('details', {class: 'tp-wrong-list'}, [h('summary', null, `第二遍错题 (${wrong.length}) · 点听`), h('div', {class: 'tp-wrong-buttons'}, wrong.length ? wrong.map(q => button(`${q}${clipPlaying.value === q ? ' ■' : ' ▶'}`, () => listen(q), api.blocked())) : '全部正确') ]));
      }
      if (error.value) children.push(h('span', {class: 'tp-error', role: 'status'}, error.value));
    }
    return h('aside', {class: `tp-bar${s.enabled ? ' tp-bar--on' : ''}${s.enabled && api.started() ? ' tp-bar--running' : ''}`, 'aria-label': '三遍听力练习'}, children);
  }
  // A component gets its own render effect; an unflagged vnode in a compiled block would stay stale.
  const component = {name: 'ThreePassAddon', setup: () => render};
  return {component, render, restore, setup, terminal, finish, completed, snapshot: () => state.value.enabled ? copy(state.value) : undefined,
    get enabled() { return state.value.enabled; }, get strict() { return state.value.enabled && state.value.stage === 'first'; },
    get blocksRun() { return state.value.enabled && ['ready', 'third'].includes(state.value.stage); },
    get submissionLocked() { return state.value.enabled && (busy.value || !!state.value.payload && state.value.stage === 'ready'); }};
}

export function showReviewSummary(id, review) {
  const user = owner();
  if (!user || !id) return;
  let summary;
  try { summary = JSON.parse(sessionStorage.getItem(`xxgg-three-pass:${user}:${id}`) || 'null'); } catch { return; }
  if (!summary || summary.owner !== user) return;
  const finalGrades = extractGrades(review);
  // The final original submission may have retried a frozen payload. Its server-returned
  // answers, rather than the current editable draft, are the authority for this column.
  const finalAnswers = {};
  for (const part of review?.parts ?? []) for (const group of part.groups ?? []) for (const question of group.questions ?? []) {
    if (question.qNumber != null) finalAnswers[String(question.qNumber)] = question.userAnswer ?? question.answer ?? '';
  }
  const correct = grades => Object.values(grades).filter(g => g.correct).length;
  const modified = Object.keys(summary.changed || {}).length;
  const repaired = Object.keys(finalGrades).filter(q => summary.grades[q]?.correct === false && finalGrades[q].correct).length;
  // The original review calls this after Vue nextTick. A microtask also runs while
  // the native window is hidden, unlike requestAnimationFrame.
  queueMicrotask(() => {
    if (owner() !== user) return;
    const query = new URLSearchParams(location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : location.search);
    if (query.get('resultId') !== String(id)) return;
    const frame = document.querySelector('.app-container--review .content-frame');
    if (!frame || frame.querySelector('.tp-review-summary')) return;
    const node = document.createElement('div'); node.className = 'tp-review-summary'; node.dataset.tpOwner = user;
    node.textContent = `三遍练习完成 · 修改过 ${modified} 题 · 第二遍 ${correct(summary.grades)} 对 → 第三遍 ${correct(finalGrades)} 对 · 修正 ${repaired} 题`;
    const details = document.createElement('details'); details.className = 'tp-comparison';
    const heading = document.createElement('summary'); heading.textContent = '查看三遍答案对照'; details.append(heading);
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const label of ['题号', '第一遍', '第二遍', '第三遍', '第二遍 → 第三遍']) { const cell = document.createElement('th'); cell.textContent = label; head.append(cell); }
    table.append(head);
    const keys = [...new Set([...Object.keys(summary.first), ...Object.keys(summary.second), ...Object.keys(finalAnswers)])].sort((a, b) => Number(a) - Number(b));
    for (const q of keys) {
      const row = document.createElement('tr');
      const status = grade => grade == null ? '—' : grade.correct ? '正确' : '错误';
      for (const value of [q, summary.first[q] || '（空）', summary.second[q] || '（空）', finalAnswers[q] || '（空）', `${status(summary.grades[q])} → ${status(finalGrades[q])}`]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      table.append(row);
    }
    details.append(table); node.append(details);
    frame.prepend(node);
  });
}
export function reconcileReviewSummary() {
  const user = owner();
  for (const node of document.querySelectorAll('.tp-review-summary, .wr-copy-review')) if (!user || (node.dataset.tpOwner??node.dataset.owner) !== user) node.remove();
}
