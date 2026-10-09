import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NCEPracticePanel, NCERecordingPlaceholder } from '@/components/NCEPracticePanel';
import { NCEScopeControls } from '@/components/NCEShadowingControls';
import { AIPanel } from '@/components/AIPanel';
import { useAuth } from '@/hooks/useAuth';
import { usePro } from '@/hooks/usePro';
import { useWordPracticeAudio } from '@/hooks/useWordPracticeAudio';
import { db } from '@/db/schema';
import { getModuleCards, getNCEModulesByBook, isNCEBookAccessible } from '@/db/crud';
import { getInitPromise } from '@/lib/dataLoader';
import { decodeHtml } from '@/lib/decodeHtml';
import { canCheckNCE, NCE_MAX_INPUT, isOriginalNCESentence } from '@/lib/nceShadowing';
import { loadNCEProperNames, resolveNCENameSpans, nceTextHash, type NCENameSpan } from '@/lib/nceProperNames';
import { checkNCESession, createNCESession, editNCEDraft, editNCESpans, moveNCESession, nceAutoNextAllowed, nceContext, readNCECompleted, reconcileNCESessionSources, readNCENameOverride, readNCEActiveSession, selectNCEHydrationSnapshot, saveNCENameOverride, saveNCESession, type NCERange, type NCESession, type NCEPreferences } from '@/lib/nceShadowingStore';
import type { Card, Module } from '@/types';
const inputStyle = 'rounded border border-[var(--app-line)] bg-[var(--app-surface)] p-2';
function integer(value: string | null, fallback: number) {
    const parsed = Number(value);
    return value && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export default function NCEShadowing() {
    const { user, loading } = useAuth();
    const { isPro } = usePro();
    const { moduleId = '' } = useParams();
    const [params] = useSearchParams();
    const range = useMemo<NCERange>(() => ({
        start: integer(params.get('start'), 1), end: integer(params.get('end'), Number.MAX_SAFE_INTEGER), mode: params.get('mode') === 'hidden' ? 'hidden' : 'visible'
    }), [params]);
    const owner = user?.id || 'guest';
    if (loading)
        return <div className="quiet-page" role="status">正在准备学习记录…</div>;
    return <ShadowingStudy key={JSON.stringify([owner, moduleId, range, params.get('targetId')])} owner={owner} moduleId={moduleId} range={range} targetId={params.get('targetId') || ''} isPro={isPro}/>;
}
function ShadowingStudy({ owner, moduleId, range, targetId, isPro }: {
    owner: string;
    moduleId: string;
    range: NCERange;
    targetId: string;
    isPro: boolean;
}) {
    const navigate = useNavigate();
    const audio = useWordPracticeAudio();
    const [cards, setCards] = useState<Card[]>([]);
    const [module, setModule] = useState<Module | null>(null);
    const [lessons, setLessons] = useState<Module[]>([]);
    const [session, setSession] = useState<NCESession | null>(null);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [pending, setPending] = useState(false);
    const [saving, setSaving] = useState(false);
    const [composing, setComposing] = useState(false);
    const [hidden, setHidden] = useState(document.hidden);
    const [focus, setFocus] = useState(false);
    const [daily, setDaily] = useState<number | null>(null);
    const [dailyError, setDailyError] = useState('');
    const [nameEditing, setNameEditing] = useState(false);
    const [selection, setSelection] = useState<NCERange>(range);
    const currentRef = useRef<NCESession | null>(null);
    const membership = useRef(isPro);
    const mounted = useRef(true);
    const busy = useRef(false);
    const chain = useRef<Promise<void>>(Promise.resolve());
    const writeToken = useRef(0);
    const dailyReadToken = useRef(0);
    const page = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const overrides = useRef<Record<string, {
        text: string;
        spans: NCENameSpan[];
    }>>({});
    const blocked = pending || saving || !!error;
    const blocker = useBlocker(blocked);
    const update = useCallback((next: NCESession) => {
        currentRef.current = next;
        setSession(next);
    }, []);
    const persist = useCallback((next: NCESession) => {
        const token = ++writeToken.current;
        setPending(true);
        // Snapshots and keys stay bound to this owner and range even after an auth/route switch.
        const changed = {
            ...overrides.current
        };
        chain.current = chain.current.catch(() => {
        }).then(async () => {
            await saveNCESession(next);
            for (const [id, value] of Object.entries(changed))
                await saveNCENameOverride(next.owner, id, value.text, value.spans);
        });
        void chain.current.then(() => {
            if (mounted.current && token === writeToken.current)
                setPending(false);
        }, () => {
            if (mounted.current && token === writeToken.current) {
                setPending(false);
                setError('本机保存失败，答案和当前句仍保留。请重试保存。');
            }
        });
    }, []);
    const refreshDaily = useCallback(async () => {
        const token = ++dailyReadToken.current;
        const date = new Date().toDateString();
        try {
            const count = await readNCECompleted(owner);
            if (mounted.current && token === dailyReadToken.current && date === new Date().toDateString()) {
                setDaily(count);
                setDailyError('');
            }
        }
        catch {
            if (mounted.current && token === dailyReadToken.current)
                setDailyError('今日完成数读取失败，可重试读取。');
        }
    }, [owner]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (blocker.state === 'blocked' && !blocked)
            blocker.proceed();
    }, [blocker, blocked]);
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (blocked) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [blocked]);
    useEffect(() => {
        const changed = membership.current !== isPro;
        membership.current = isPro;
        // Only the initially locked/unloaded exercise needs hydration on upgrade.
        // Membership changes never reload an existing draft or saved-error state.
        if (changed && isPro && !currentRef.current) setAttempt(value => value + 1);
    }, [isPro]);
    useEffect(() => {
        let active = true;
        void (async () => {
            await getInitPromise();
            const loadedModule = await db.modules.get(moduleId);
            if (!loadedModule || loadedModule.level !== 'NCE' || !loadedModule.book)
                throw new Error('未找到新概念课程。');
            if (!isNCEBookAccessible(loadedModule.book, membership.current))
                throw new Error(`${loadedModule.book} 为 PRO 课程，请先选择 Book 1 或 Book 2。`);
            const [all, mods, artifact] = await Promise.all([getModuleCards(moduleId), getNCEModulesByBook(loadedModule.book), loadNCEProperNames()]);
            const originals = all.filter(isOriginalNCESentence);
            if (!originals.length)
                throw new Error('本课没有可练习的原始句子。');
            const start = Math.min(range.start, originals.length);
            const end = Math.min(Math.max(start, range.end), originals.length);
            const actualRange = {
                ...range, start, end
            };
            const queue = originals.slice(start - 1, end).map(c => c.cardId);

            const hashes: Record<string, string> = {};
            const spans: Record<string, NCENameSpan[]> = {};
            for (const c of originals) {
                hashes[c.cardId] = await nceTextHash(c.englishText);
                const manual = await readNCENameOverride(owner, c.cardId, c.englishText);
                spans[c.cardId] = await resolveNCENameSpans(artifact, c.cardId, c.englishText, manual);
            }
            const restored = await readNCEActiveSession(owner, nceContext(moduleId, actualRange), () => currentRef.current);
            // No await from this live selection through reconcile/update: a check
            // may have completed while the caller awaited the restore helper.
            const base = selectNCEHydrationSnapshot(owner, nceContext(moduleId, actualRange), restored, currentRef.current);
            let next = base && base.queue.every(id => queue.includes(id)) && base.queue.length === queue.length ? base : createNCESession(owner, moduleId, actualRange, queue);
            // Manual edits during the asynchronous seed read remain authoritative,
            // including an unsaved explicit empty override.
            for (const card of originals) {
                const local = overrides.current[card.cardId];
                if (local?.text === card.englishText) spans[card.cardId] = local.spans;
            }
            next = reconcileNCESessionSources(next, hashes, spans);
            if (!currentRef.current && targetId && queue.includes(targetId) && next.position !== queue.indexOf(targetId))
                next = moveNCESession(next, queue.indexOf(targetId) - next.position);
            if (!active)
                return;
            setCards(originals);
            setModule(loadedModule);
            setLessons(mods);
            setSelection(actualRange);
            setLoadError('');
            update(next);
            persist(next);
            void refreshDaily();
        })().catch(e => {
            if (active)
                setLoadError(e instanceof Error ? e.message : '课程或练习记录读取失败，请重试。');
        });
        return () => {
            active = false;
        };
    }, [owner, moduleId, range, targetId, attempt, update, persist, refreshDaily]);
    useEffect(() => {
        let date = new Date().toDateString();
        const visible = () => {
            setHidden(document.hidden);
            if (!document.hidden)
                void refreshDaily();
        };
        const timer = window.setInterval(() => {
            const now = new Date().toDateString();
            if (now !== date && !document.hidden) {
                date = now;
                setDaily(null);
                void refreshDaily();
            }
        }, 1000);
        document.addEventListener('visibilitychange', visible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [refreshDaily]);
    useEffect(() => {
        const change = () => {
            if (!document.fullscreenElement)
                setFocus(false);
        };
        document.addEventListener('fullscreenchange', change);
        return () => document.removeEventListener('fullscreenchange', change);
    }, []);
    const current = cards.find(c => c.cardId === session?.queue[session.position]);
    const prefs = session?.preferences;
    const locked = !!module?.book && !isNCEBookAccessible(module.book, isPro);
    useEffect(() => {
        if (locked) audio.player.stop();
    }, [locked, audio.player]);
    useEffect(() => {
        if (!prefs)
            return;
        audio.player.update({
            speed: prefs.speed, muted: prefs.muted
        });
    }, [audio.player, prefs]);
    useEffect(() => {
        audio.player.stop();
        setNameEditing(false);
        input.current?.focus();
    }, [audio.player, session?.position]);
    const mutate = useCallback((fn: (s: NCESession) => NCESession) => {
        const s = currentRef.current;
        if (!s || busy.current)
            return;
        const next = fn(s);
        update(next);
        persist(next);
    }, [update, persist]);
    useEffect(() => {
        if (!session || session.finished || session.evaluation || hidden || composing || blocked || locked)
            return;
        const timer = window.setInterval(() => mutate(s => ({
            ...s, elapsed: s.elapsed + 1
        })), 1000);
        return () => window.clearInterval(timer);
    }, [session, hidden, composing, blocked, locked, mutate]);
    const advance = useCallback(() => {
        const s = currentRef.current;
        if (!s || !s.evaluation || busy.current || blocked || composing || locked)
            return;
        audio.player.stop();
        mutate(v => v.position + 1 >= v.queue.length ? {
            ...v, finished: true
        } : moveNCESession(v, 1));
    }, [audio.player, blocked, composing, locked, mutate]);
    const auto = nceAutoNextAllowed(session, {
        hidden, composing, saving, pending, locked, error: !!error, editing: nameEditing || !session?.evaluation
    });
    useEffect(() => {
        if (!auto)
            return;
        const timer = window.setTimeout(advance, 1500);
        return () => window.clearTimeout(timer);
    }, [auto, session?.position, session?.evaluation, advance]);
    async function check() {
        const s = currentRef.current;
        if (!s || !current || busy.current || composing || error || locked || !canCheckNCE(s.draft, composing))
            return;
        busy.current = true;
        setSaving(true);
        try {
            await chain.current;
            const next = await checkNCESession(s, current.englishText, () => mounted.current);
            if (!mounted.current)
                return;
            update(next);
            setError('');
            audio.player.stop();
            void refreshDaily();
        }
        catch {
            if (mounted.current)
                setError('检查结果保存失败，已留在当前句，草稿仍保留。请重试保存后重新检查。');
        }
        finally {
            busy.current = false;
            if (mounted.current)
                setSaving(false);
        }
    }
    async function retrySave() {
        if (busy.current)
            return;
        busy.current = true;
        setSaving(true);
        try {
            await chain.current.catch(() => {
            });
            const s = currentRef.current;
            if (s) {
                await saveNCESession(s);
                for (const [id, value] of Object.entries(overrides.current))
                    await saveNCENameOverride(owner, id, value.text, value.spans);
            }
            chain.current = Promise.resolve();
            if (mounted.current) {
                setPending(false);
                setError('');
            }
        }
        catch {
            if (mounted.current)
                setError('保存仍失败，请保留页面并重试。');
        }
        finally {
            busy.current = false;
            if (mounted.current)
                setSaving(false);
        }
    }
    async function go(url: string) {
        if (busy.current || error)
            return;
        busy.current = true;
        setSaving(true);
        try {
            await chain.current;
            if (mounted.current) {
                audio.player.stop();
                navigate(url);
            }
        }
        catch {
            if (mounted.current)
                setError('草稿保存失败，请重试保存后再切换。');
        }
        finally {
            busy.current = false;
            if (mounted.current)
                setSaving(false);
        }
    }
    function changePrefs(patch: Partial<NCEPreferences>) {
        mutate(s => ({
            ...s, preferences: {
                ...s.preferences, ...patch
            }
        }));
    }
    function mark(spans: NCENameSpan[]) {
        if (!current)
            return;
        overrides.current = {
            ...overrides.current, [current.cardId]: {
                text: current.englishText, spans
            }
        };
        mutate(s => editNCESpans(s, current.cardId, current.englishText, spans));
    }
    async function fullscreen() {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            setFocus(false);
            return;
        }
        setFocus(v => !v);
        if (!focus && window.matchMedia('(min-width: 768px)').matches && page.current?.requestFullscreen) {
            try {
                await page.current.requestFullscreen();
            }
            catch {
                // Browsers without fullscreen permission keep the usable focus layout.
            }
        }
    }
    if (loadError && !session)
        return <div className="quiet-page space-y-4">
        <p role="alert">{loadError}</p>
        <Button onClick={() => setAttempt(v => v + 1)}>重试读取</Button>
        <Button variant="outline" onClick={() => navigate('/nce')}>返回课程</Button>
        </div>;
    if (!session || !module || !prefs)
        return <div className="quiet-page" role="status">正在准备课程与跟读记录…</div>;
    const answered = Object.keys(session.results).length;
    const progress = Math.round(answered / session.queue.length * 100);
    const firstScores = Object.values(session.results).map(r => r.first.score).filter((s): s is number => s !== null);
    const lastScores = Object.values(session.results).map(r => r.attempts.at(-1)!.score).filter((s): s is number => s !== null);
    const mean = (values: number[]) => values.length ? `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}%` : '无数值成绩';
    return <div ref={page} className={`quiet-page space-y-5 bg-[var(--app-bg)] ${focus ? 'fixed inset-0 z-50 overflow-y-auto p-4 md:p-8' : ''}`}>
  <header className="flex flex-wrap items-center justify-between gap-3">
    <div>
    <Button variant="ghost" disabled={saving || !!error} onClick={() => {
            void go('/nce');
        }}>返回课程</Button>
    <h1 className="quiet-display mt-3 text-3xl md:text-5xl">新概念输入法跟读。</h1>
    <p className="mt-2 text-sm text-[var(--app-muted)]">{module.book} · Lesson {module.lessonNum} · {session.range.mode === "hidden" && !session.evaluation ? "" : module.lessonTitle}</p>
    </div>
    <div className="flex flex-wrap gap-2">
    <Button variant="outline" disabled={saving || !!error} onClick={() => {
            void go("/feedback");
        }}>反馈</Button>
    <Button variant="outline" onClick={() => {
            void fullscreen();
        }}>{focus ? '退出专注' : '全屏 / 专注'}</Button>
    </div>
    </header>
  <section className="quiet-surface space-y-3 p-4">
    <NCEScopeControls moduleId={moduleId} lessons={lessons} count={cards.length} selection={selection} hideTitles={session.range.mode === 'hidden' && !session.evaluation} disabled={saving || !!error} onSelection={setSelection} onLesson={id => {
            void go(`/nce/shadowing/${encodeURIComponent(id)}`);
        }} onApply={() => {
            void go(`/nce/shadowing/${encodeURIComponent(moduleId)}?start=${selection.start}&end=${selection.end}&mode=${selection.mode}`);
        }}/>
    <p className="text-xs text-[var(--app-muted)]">本轮第 {session.range.start}–{session.range.end} 句，共 {session.queue.length} 句原文。合并卡片和标题不进入练习。</p>
    </section>
  <section className="quiet-surface space-y-3 p-4">
    <p>本轮完成 {answered}/{session.queue.length} 句 · {progress}% · 用时 {Math.floor(session.elapsed / 60)}分{session.elapsed % 60}秒</p>
    <progress aria-label="本轮完成进度" className="h-3 w-full" value={answered} max={session.queue.length}/>
    <div className="flex flex-wrap items-center gap-3">
    <label>今日目标 <input className={`${inputStyle} w-20`} type="number" min={1} max={9999} value={prefs.goal} disabled={saving} onChange={e => changePrefs({
        goal: Math.min(9999, integer(e.target.value, 1))
    })}/>
    </label>
    <p>今日已完成 {daily === null ? '…' : daily}/{prefs.goal} 句{daily !== null ? ` · ${Math.min(100, Math.round(daily / prefs.goal * 100))}%` : ''}</p>
    </div>
    <progress aria-label="今日目标进度" className="h-3 w-full" value={Math.min(daily || 0, prefs.goal)} max={prefs.goal}/>{dailyError && <p role="alert">{dailyError}<Button size="sm" variant="outline" onClick={() => {
                void refreshDaily();
            }}>重试读取</Button>
        </p>}</section>
  {loadError && <div role="alert" className="quiet-surface space-y-2 p-4"><p>{loadError}</p><Button disabled={saving || !!error} onClick={() => setAttempt(v => v + 1)}>重试读取</Button></div>}
  {error && <div role="alert" className="quiet-surface space-y-2 p-4 text-red-700">
        <p>{error}</p>
        <Button disabled={saving} onClick={() => {
                void retrySave();
            }}>重试保存</Button>
        </div>}
  {locked ? <p role="alert">该课程需要 PRO 权限。</p> : session.finished ? <section className="quiet-surface space-y-4 p-6">
        <h2 className="text-xl">本轮结束</h2>
        <p>已检查 {answered} 句 · 首次平均 {mean(firstScores)} · 最近一次平均 {mean(lastScores)}</p>
        <p>未答句不进入成绩统计；专名全部免评的句子不计数值均分。</p>
        <Button disabled={saving || !!error} onClick={() => mutate(s => ({
            ...s, finished: false
        }))}>继续本轮</Button>
        </section> : current && <>
   <section className="quiet-surface flex flex-wrap items-center gap-3 p-4">
        <Button variant="outline" disabled={!current.audioFile || prefs.muted} onClick={() => audio.player.play({
            id: current.cardId, word: '', audio: `/data/audio/${current.audioFile}`
        }, prefs)}>播放原文</Button>
        <Button variant="outline" onClick={() => audio.player.stop()}>停止</Button>
        <label>重复次数 <select className={inputStyle} value={prefs.repeats} disabled={saving} onChange={e => changePrefs({
            repeats: Number(e.target.value)
        })}>{[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label>速度 <select className={inputStyle} value={prefs.speed} disabled={saving} onChange={e => changePrefs({
            speed: Number(e.target.value)
        })}>{[0.5, 0.75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n}×</option>)}</select>
        </label>
        <label>
        <input type="checkbox" checked={prefs.muted} disabled={saving} onChange={e => changePrefs({
            muted: e.target.checked
        })}/> 静音</label>
        <label>
        <input type="checkbox" checked={prefs.autoNext} disabled={saving} onChange={e => changePrefs({
            autoNext: e.target.checked
        })}/> 100% 保存后自动继续</label>{audio.state === 'error' && <p role="alert">原文音频播放失败，请点击播放重试。</p>}</section>
   <p className="text-sm">当前第 {session.range.start + session.position} 句 · 本轮 {session.position + 1}/{session.queue.length}</p>
   <NCEPracticePanel key={current.cardId} text={current.englishText} translation={decodeHtml(current.chineseText)} hidden={session.range.mode === 'hidden'} evaluation={session.evaluation?.comparison || null} spans={session.spans[current.cardId] || []} onSpans={mark} onEditing={setNameEditing} analysis={current.aiAnalysis} showAnnotations={prefs.showAnalysis} analysisUnlocked={isPro || Boolean(current.aiUnlocked)} disabled={saving}/>
   {(session.range.mode === 'visible' || session.evaluation) && <section>
            <label>
            <input type="checkbox" checked={prefs.showAnalysis} disabled={saving} onChange={e => changePrefs({
                showAnalysis: e.target.checked
            })}/> 显示已有解析</label>{prefs.showAnalysis && (isPro || current.aiUnlocked) && <AIPanel analysis={current.aiAnalysis} isLocked={false}/>}{prefs.showAnalysis && !isPro && !current.aiUnlocked && <p className="text-sm text-[var(--app-muted)]">此原句解析尚未解锁，可在原句卡片中按已有规则解锁。</p>}</section>}
   <section className="quiet-surface space-y-3 p-4">
        <label className="block font-medium" htmlFor="nce-answer">朗读转写 / 手动输入</label>
        <p className="text-sm text-[var(--app-muted)]">点击手机键盘的麦克风，朗读后检查文字。Enter 保留换行。单句最多检查 {NCE_MAX_INPUT} 字符，超出时保留全部草稿。</p>
        <textarea id="nce-answer" ref={input} rows={5} value={session.draft} disabled={saving} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onChange={e => mutate(s => editNCEDraft(s, e.target.value))} className="w-full rounded border border-[var(--app-line)] bg-[var(--app-bg)] p-3 text-lg"/>{session.draft.length > NCE_MAX_INPUT && <p role="alert" className="text-red-700">输入超过 {NCE_MAX_INPUT} 字符，请精简后检查。当前草稿未截断。</p>}<div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={saving || !!error || composing || session.position === 0} onClick={() => {
                audio.player.stop();
                mutate(s => moveNCESession(s, -1));
            }}>上一句</Button>
        <Button variant="outline" disabled={saving || composing} onClick={() => mutate(s => editNCEDraft(s, ''))}>清空重练</Button>
        <Button disabled={saving || !!error || composing || !canCheckNCE(session.draft, composing)} onClick={() => {
                void check();
            }}>检查文字</Button>
        <Button variant="outline" disabled={saving || pending || !!error || composing || !session.evaluation} onClick={advance}>{session.position + 1 === session.queue.length ? '完成本轮' : '下一句'}</Button>
        <Button variant="outline" disabled={saving || !!error || composing} onClick={() => mutate(s => ({
            ...s, finished: true
        }))}>结束练习</Button>
        </div>{session.results[current.cardId] && <p className="text-xs text-[var(--app-muted)]">首次 {session.results[current.cardId].first.score === null ? '无数值成绩' : `${Math.round(session.results[current.cardId].first.score!)}%`} · 已检查 {session.results[current.cardId].attempts.length} 次</p>}<p role="status" className="text-xs text-[var(--app-muted)]">{saving ? '正在保存检查…' : pending ? '正在保存草稿 / 设置…' : error ? '保存待重试' : '草稿与设置已保存到本机'}</p>
        </section>
   <NCERecordingPlaceholder />
  </>}
  {blocker.state === 'blocked' && <div role="alertdialog" aria-label="保存后离开" className="fixed inset-x-4 bottom-5 z-[70] space-y-3 rounded border bg-[var(--app-surface)] p-5 shadow-xl">
        <p>草稿或设置正在保存，或保存失败。成功后可继续离开。</p>
        <div className="flex gap-2">
        <Button disabled={saving || pending} onClick={() => {
                void retrySave();
            }}>重试保存并继续</Button>
        <Button variant="outline" onClick={() => blocker.reset()}>留在练习</Button>
        </div>
        </div>}
 </div>;
}
