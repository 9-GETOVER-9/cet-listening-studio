import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
const modules = import.meta.glob('./nceShadowingStore.ts');
async function api() { expect(modules['./nceShadowingStore.ts'], 'independent shadowing store must exist').toBeDefined(); return await modules['./nceShadowingStore.ts']() as typeof import('./nceShadowingStore'); }
beforeEach(async () => { await db.delete(); await db.open(); });
it('preserves first result across retries, idempotent checks and edits invalidate current evaluation', async () => {
    const p = await api();
    let s = p.createNCESession('a', 'Book2-L1', { start: 1, end: 2, mode: 'visible' }, ['c', 'd']);
    s = p.editNCEDraft(s, 'bad');
    s = await p.checkNCESession(s, 'good');
    expect(s.results.c.first.score).toBe(0);
    expect(s.results.c.attempts).toHaveLength(1);
    s = await p.checkNCESession(s, 'good');
    expect(s.results.c.attempts).toHaveLength(1);
    s = p.editNCEDraft(s, 'good');
    expect(s.evaluation).toBeNull();
    s = await p.checkNCESession(s, 'good');
    expect(s.results.c.first.score).toBe(0);
    expect(s.results.c.attempts).toHaveLength(2);
    expect(Object.keys(s.results)).toHaveLength(1);
});
it('isolates owner/module/range/mode and stores drafts, spans, preferences and elapsed without FSRS mutations', async () => {
    const p = await api();
    const s = { ...p.createNCESession('a', 'Book2-L1', { start: 1, end: 1, mode: 'hidden' }, ['c']), draft: 'draft', elapsed: 12, spans: { c: [{ start: 0, end: 4, kind: 'person' as const }] } };
    await p.saveNCESession(s);
    expect(await p.readNCESession('a', s.context)).toMatchObject({ draft: 'draft', elapsed: 12, spans: s.spans });
    expect(await p.readNCESession('b', s.context)).toBeNull();
    expect(p.nceContext('Book2-L1', { start: 1, end: 1, mode: 'visible' })).not.toBe(s.context);
    expect(await db.cards.count()).toBe(0);
    expect(await db.studyLog.count()).toBe(0);
});
it('rolls back failed grade/session save and refuses stale active-owner checks', async () => {
    const p = await api();
    const s = p.editNCEDraft(p.createNCESession('a', 'm', { start: 1, end: 1, mode: 'visible' }, ['c']), 'good');
    await p.saveNCESession(s);
    const fail = vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('quota'));
    await expect(p.checkNCESession(s, 'good')).rejects.toThrow('quota');
    fail.mockRestore();
    expect((await p.readNCESession('a', s.context))?.evaluation).toBeNull();
    await expect(p.checkNCESession(s, 'good', () => false)).rejects.toThrow();
    expect(await p.readNCECompleted('a')).toBe(0);
});
it('keeps per-sentence draft when locating a target or returning to the previous sentence', async () => {
    const p = await api();
    let s = p.editNCEDraft(p.createNCESession('a', 'm', { start: 1, end: 2, mode: 'visible' }, ['c', 'd']), 'unfinished');
    s = p.moveNCESession(s, 1);
    expect(s.draft).toBe('');
    s = p.editNCEDraft(s, 'second');
    s = p.moveNCESession(s, -1);
    expect(s.draft).toBe('unfinished');
});
it('auto-next only accepts saved perfect numerical results and pauses under composition and pending writes', async () => {
    const p = await api();
    let s = p.editNCEDraft(p.createNCESession('a', 'm', { start: 1, end: 1, mode: 'visible' }, ['c']), 'good');
    s = await p.checkNCESession(s, 'good');
    s.preferences.autoNext = true;
    const state = { hidden: false, composing: false, saving: false, pending: false, error: false, editing: false };
    expect(p.nceAutoNextAllowed(s, state)).toBe(true);
    expect(p.nceAutoNextAllowed(s, { ...state, composing: true })).toBe(false);
    expect(p.nceAutoNextAllowed(s, { ...state, pending: true })).toBe(false);
    expect(p.nceAutoNextAllowed(p.editNCEDraft(s, 'changed'), state)).toBe(false);
});
it('leaves actual source FSRS unchanged and atomically saves no completed receipt on failure', async () => {
    const p = await api();
    const { createInitialFSRSState } = await import('./fsrsScheduler');
    const fsrsMain = createInitialFSRSState();
    await db.cards.put({ cardId: 'c', moduleId: 'm', level: 'NCE', book: 'Book2', englishText: 'good', chineseText: '好', audioFile: 'real.mp3', tags: [], difficulty: 'basic', aiAnalysis: { phrases: [], pronunciation: [], grammar: [] }, fsrsMain });
    const before = await db.cards.get('c');
    const s = p.editNCEDraft(p.createNCESession('a', 'm', { start: 1, end: 1, mode: 'visible' }, ['c']), 'good');
    await p.saveNCESession(s);
    const original = db.settings.put.bind(db.settings);
    let calls = 0;
    const fail = vi.spyOn(db.settings, 'put').mockImplementation((...args: Parameters<typeof db.settings.put>) => { calls++; if (calls === 2)
        return Promise.reject(new Error('session quota')) as ReturnType<typeof db.settings.put>; return original(...args); });
    await expect(p.checkNCESession(s, 'good')).rejects.toThrow('session quota');
    fail.mockRestore();
    expect(await p.readNCECompleted('a')).toBe(0);
    expect((await p.readNCESession('a', s.context))?.evaluation).toBeNull();
    const checked = await p.checkNCESession(s, 'good');
    await p.checkNCESession(checked, 'good');
    expect(await p.readNCECompleted('a')).toBe(1);
    expect(await db.cards.get('c')).toEqual(before);
    expect(await db.studyLog.count()).toBe(0);
});
it('persists manual spans by owner and exact source hash including explicit empty override', async () => {
    const p = await api();
    await p.saveNCENameOverride('a', 'c', 'John is here', [{ start: 0, end: 4, kind: 'person' }]);
    expect(await p.readNCENameOverride('a', 'c', 'John is here')).toHaveLength(1);
    expect(await p.readNCENameOverride('b', 'c', 'John is here')).toBeNull();
    expect(await p.readNCENameOverride('a', 'c', 'Jack is here')).toBeNull();
    await p.saveNCENameOverride('a', 'c', 'John is here', []);
    expect(await p.readNCENameOverride('a', 'c', 'John is here')).toEqual([]);
});
it('restores checked evaluation on previous and separates range/module session drafts', async () => {
    const p = await api();
    let s = p.editNCEDraft(p.createNCESession('a', 'm', { start: 1, end: 2, mode: 'visible' }, ['c', 'd']), 'good');
    s = await p.checkNCESession(s, 'good');
    s = p.moveNCESession(s, 1);
    s = p.moveNCESession(s, -1);
    expect(s.evaluation?.score).toBe(100);
    await p.saveNCESession(s);
    expect(await p.readNCESession('a', p.nceContext('m', { start: 2, end: 2, mode: 'visible' }))).toBeNull();
    expect(await p.readNCESession('a', p.nceContext('different', { start: 1, end: 2, mode: 'visible' }))).toBeNull();
});
it('invalidates a restored perfect evaluation when a manual name override or source hash changed', async () => { const p = await api(); let s = p.editNCEDraft(p.createNCESession('a', 'm', { start: 1, end: 1, mode: 'visible' }, ['c']), 'good'); s = await p.checkNCESession(s, 'good'); expect(p.reconcileNCESessionSources(s, { c: 'changed' }, s.spans).evaluation).toBeNull(); expect(p.reconcileNCESessionSources(s, s.textHashes, { c: [{ start: 0, end: 4, kind: 'person' }] }).evaluation).toBeNull(); expect(p.reconcileNCESessionSources(s, s.textHashes, s.spans).evaluation?.score).toBe(100); });

it('binds daily receipt reads to the requested local date across a midnight change',async()=>{
 const p=await api();vi.useFakeTimers({toFake:['Date']});try{vi.setSystemTime(new Date(2026,9,9,23,59,59));for(const [id,checkedAt]of [['old1',new Date(2026,9,9,12).getTime()],['old2',new Date(2026,9,9,13).getTime()],['new',new Date(2026,9,10,1).getTime()]] as const)await db.settings.put({key:`nce-shadowing:receipt:${JSON.stringify('a')}:${id}`,value:{checkedAt}});const pending=p.readNCECompleted('a');vi.setSystemTime(new Date(2026,9,10,0,0,1));expect(await pending).toBe(2);expect(await p.readNCECompleted('a')).toBe(1)}finally{vi.useRealTimers()}
})
it('restores from the latest in-memory draft rather than older DB after a failed or pending save',async()=>{
 const p=await api();const old=p.editNCEDraft(p.createNCESession('a','m',{start:1,end:1,mode:'visible'},['c']),'saved old');await p.saveNCESession(old);const latest=p.editNCEDraft(old,'unsaved newest');const failure=vi.spyOn(db.settings,'put').mockRejectedValueOnce(new Error('quota'));await expect(p.saveNCESession(latest)).rejects.toThrow('quota');failure.mockRestore();expect((await p.readNCEActiveSession('a',old.context,()=>latest))?.draft).toBe('unsaved newest');expect((await p.readNCESession('a',old.context))?.draft).toBe('saved old')
})
it('rejects a delayed DB hydrate when a newer matching owner/context session appeared meanwhile',async()=>{
 const p=await api();const old=p.editNCEDraft(p.createNCESession('a','m',{start:1,end:1,mode:'visible'},['c']),'old');let current:typeof old|null=null;let resolve!:(s:typeof old)=>void;const read=()=>new Promise<typeof old>(done=>{resolve=done});const load=p.readNCEActiveSession('a',old.context,()=>current,read);current=p.editNCEDraft(old,'new while reading');resolve(old);expect((await load)?.draft).toBe('new while reading');const other=p.editNCEDraft({...old,owner:'b'},'another owner');expect((await p.readNCEActiveSession('a',old.context,()=>other,async()=>old))?.draft).toBe('old')
})
it('rechecks the live hydration base after the caller await when parallel check completion updated results',async()=>{
 const p=await api();const old=p.editNCEDraft(p.createNCESession('a','m',{start:1,end:1,mode:'visible'},['c']),'good');const checked=await p.checkNCESession(old,'good');let current=old;
 const completion=Promise.resolve().then(()=>{current=checked});
 const loading=(async()=>{const restored=await p.readNCEActiveSession('a',old.context,()=>current);return p.selectNCEHydrationSnapshot('a',old.context,restored,current)})();
 await completion;const next=await loading;expect(next?.evaluation?.score).toBe(100);expect(next?.results.c.attempts).toHaveLength(1);expect(p.selectNCEHydrationSnapshot('a',old.context,checked,{...checked,owner:'b'})).toBe(checked)
})