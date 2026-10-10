import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, ChevronRight, Mic, Settings2, Volume2, Square } from 'lucide-react';
import '@/styles/nceShadowing.css';
import { NCEPracticePanel } from '@/components/NCEPracticePanel';
import { NCERecordingPanel } from '@/components/NCERecordingPanel';
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
import { checkNCESession, createNCESession, editNCEDraft, editNCESpans, moveNCESession, nceAutoNextAllowed, nceContext, reconcileNCESessionSources, readNCENameOverride, readNCEActiveSession, selectNCEHydrationSnapshot, saveNCENameOverride, saveNCESession, type NCERange, type NCESession, type NCEPreferences } from '@/lib/nceShadowingStore';
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
    return <ShadowingStudy key={JSON.stringify([owner, moduleId, range, params.get('targetId')])} owner={owner} moduleId={moduleId} range={range} targetId={params.get('targetId') || ''} isPro={isPro} recordingOpen={params.get('recording') === '1'}/>;
}
function ShadowingStudy({ owner, moduleId, range, targetId, isPro, recordingOpen }: {
    owner: string;
    moduleId: string;
    range: NCERange;
    targetId: string;
    isPro: boolean;
    recordingOpen: boolean;
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
    const [recordingBusy, setRecordingBusy] = useState(false);
    const [playbackSignal, setPlaybackSignal] = useState(0);
    const stopOriginal = useCallback(() => audio.player.stop(), [audio.player]);
    const [composing, setComposing] = useState(false);
    const [hidden, setHidden] = useState(document.hidden);
    const [focus, setFocus] = useState(false);
    const [nameEditing, setNameEditing] = useState(false);
    const [selection, setSelection] = useState<NCERange>(range);
    const currentRef = useRef<NCESession | null>(null);
    const membership = useRef(isPro);
    const mounted = useRef(true);
    const busy = useRef(false);
    const chain = useRef<Promise<void>>(Promise.resolve());
    const writeToken = useRef(0);
    const page = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const overrides = useRef<Record<string, {
        text: string;
        spans: NCENameSpan[];
    }>>({});
    const blocked = pending || saving || !!error || recordingBusy;
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
        })().catch(e => {
            if (active)
                setLoadError(e instanceof Error ? e.message : '课程或练习记录读取失败，请重试。');
        });
        return () => {
            active = false;
        };
    }, [owner, moduleId, range, targetId, attempt, update, persist]);
    useEffect(() => {
        const visible = () => setHidden(document.hidden);
        document.addEventListener('visibilitychange', visible);
        return () => document.removeEventListener('visibilitychange', visible);
    }, []);
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
    }, [audio.player, session?.position]);
    const mutate = useCallback((fn: (s: NCESession) => NCESession) => {
        const s = currentRef.current;
        if (!s || busy.current)
            return;
        const next = fn(s);
        update(next);
        persist(next);
    }, [update, persist]);
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
        hidden, composing, saving, pending, locked, error: !!error, editing: recordingBusy || nameEditing || !session?.evaluation
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
        if (busy.current || error || recordingBusy)
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
    const firstScores = Object.values(session.results).map(r => r.first.score).filter((s): s is number => s !== null);
    const lastScores = Object.values(session.results).map(r => r.attempts.at(-1)!.score).filter((s): s is number => s !== null);
    const mean = (values: number[]) => values.length ? `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}%` : '无数值成绩';
    function startSpeaking() {
        if (session?.evaluation) mutate(s => editNCEDraft(s, ''));
        input.current?.focus();
        input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const availableAnalysis = isPro || Boolean(current?.aiUnlocked);
    return <div ref={page} className={`quiet-page nce-shadowing ${focus ? 'nce-shadowing-focus' : ''}`}>
      <header className="nce-heading">
        <Button variant="ghost" className="nce-back" aria-label="返回课程" disabled={saving || !!error || recordingBusy} onClick={() => { void go('/nce'); }}><ArrowLeft aria-hidden className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">新概念跟读</h1>
          <p className="mt-1 truncate text-xs text-slate-500">{module.book} · Lesson {module.lessonNum}{session.range.mode === 'hidden' && !session.evaluation ? '' : ` · ${module.lessonTitle}`}</p>
        </div>
        <span aria-label="当前句进度" className="nce-position">{session.position + 1} / {session.queue.length}</span>
      </header>
      {loadError && <div role="alert" className="nce-error"><p>{loadError}</p><Button disabled={saving || !!error} onClick={() => setAttempt(v => v + 1)}>重试读取</Button></div>}
      {error && <div role="alert" className="nce-error"><p>{error}</p><Button disabled={saving} onClick={() => { void retrySave(); }}>重试保存</Button></div>}
      {locked ? <p role="alert">该课程需要 PRO 权限。</p> : session.finished ? <section className="nce-source-card space-y-4">
        <h2 className="text-xl font-semibold">本轮完成</h2>
        <p>已核对 {answered} 句 · 首次平均 {mean(firstScores)} · 最近一次平均 {mean(lastScores)}</p>
        <Button disabled={saving || !!error} onClick={() => mutate(s => ({ ...s, finished: false }))}>继续本轮</Button>
      </section> : current && <>
        <NCEPracticePanel key={current.cardId} text={current.englishText} translation={decodeHtml(current.chineseText)} hidden={session.range.mode === 'hidden'} evaluation={session.evaluation?.comparison || null} spans={session.spans[current.cardId] || []} onSpans={mark} onEditing={setNameEditing} analysis={current.aiAnalysis} analysisUnlocked={availableAnalysis} disabled={saving}
          audioControl={<div className="nce-audio-row">
            <Button type="button" variant="ghost" className="nce-play" disabled={!current.audioFile || recordingBusy} onClick={() => {
              setPlaybackSignal(value => value + 1);
              if (audio.state === 'playing') audio.player.stop();
              else { if (prefs.muted) changePrefs({ muted: false }); audio.player.play({ id: current.cardId, word: '', audio: `/data/audio/${current.audioFile}` }, { ...prefs, muted: false }); }
            }}>{audio.state === 'playing' ? <Square aria-hidden className="h-6 w-6" /> : <Volume2 aria-hidden className="h-6 w-6" />}{audio.state === 'playing' ? '停止播放' : '播放原音'}</Button>
            <span className="text-xs text-slate-400">{prefs.speed}× · 教材原音</span>
          </div>}
          analysisOpen={prefs.showAnalysis} onAnalysisChange={() => changePrefs({ showAnalysis: !prefs.showAnalysis })}
          analysisContent={availableAnalysis ? <AIPanel analysis={current.aiAnalysis} isLocked={false} /> : <p className="text-sm text-slate-500">此句解析尚未解锁，可在原句卡片中解锁。</p>} />
        {audio.state === 'error' && <p role="alert" className="nce-error">原音播放失败，点击播放重试。</p>}
        <section className="nce-response" aria-label="你的跟读输入">
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold" htmlFor="nce-answer"><Mic aria-hidden className="h-4 w-4" />你的跟读<span className="ml-auto text-xs font-normal text-sky-700">输入法语音输入</span></label>
          <textarea id="nce-answer" ref={input} rows={3} value={session.draft} disabled={saving} placeholder="点这里，用键盘麦克风说出这句话…" onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onChange={e => mutate(s => editNCEDraft(s, e.target.value))} className="nce-answer" />
          {session.draft.length > NCE_MAX_INPUT && <p role="alert" className="text-sm text-red-700">输入超过 {NCE_MAX_INPUT} 字符，请精简后核对。草稿未截断。</p>}
        </section>
        <p className="nce-hint">先听，再模仿。用手机键盘的麦克风输入；核对文字时忽略大小写，人名和地名免评。</p>
        <div className="nce-bottom-actions">
          <Button type="button" variant="ghost" className="nce-step" aria-label="上一句" disabled={recordingBusy || saving || !!error || composing || session.position === 0} onClick={() => { audio.player.stop(); mutate(s => moveNCESession(s, -1)); }}><ChevronLeft aria-hidden className="h-5 w-5" /><span>上一句</span></Button>
          <Button type="button" className="nce-primary" disabled={saving || !!error || composing || (!session.evaluation && !!session.draft.trim() && !canCheckNCE(session.draft, composing))} onClick={() => { if (session.evaluation || !session.draft.trim()) startSpeaking(); else void check(); }}>{saving ? '正在保存…' : session.evaluation ? '再读一遍' : session.draft.trim() ? '核对文字' : '开始跟读'}</Button>
          <Button type="button" variant="ghost" className="nce-step" aria-label={session.position + 1 === session.queue.length ? '完成本轮' : '下一句'} disabled={recordingBusy || saving || pending || !!error || composing || !session.evaluation} onClick={advance}><ChevronRight aria-hidden className="h-5 w-5" /><span>{session.position + 1 === session.queue.length ? '完成' : '下一句'}</span></Button>
        </div>
        <p role="status" className="nce-save-state">{saving ? '正在保存检查…' : pending ? '正在保存…' : error ? '保存待重试' : '已自动保存'}</p>
      </>}
      {current && <NCERecordingPanel key={JSON.stringify([owner,current.cardId])} owner={owner} cardId={current.cardId} moduleId={moduleId} onBusyChange={setRecordingBusy} onAudio={stopOriginal} playbackSignal={playbackSignal} defaultOpen={recordingOpen} disabled={locked || session.finished} />}
      <details className="nce-options">
        <summary><Settings2 aria-hidden className="h-4 w-4" />练习设置</summary>
        <div className="mt-4 space-y-5">
          <NCEScopeControls moduleId={moduleId} lessons={lessons} count={cards.length} selection={selection} hideTitles={session.range.mode === 'hidden' && !session.evaluation} disabled={recordingBusy || saving || !!error} onSelection={setSelection} onLesson={id => { void go(`/nce/shadowing/${encodeURIComponent(id)}`); }} onApply={() => { void go(`/nce/shadowing/${encodeURIComponent(moduleId)}?start=${selection.start}&end=${selection.end}&mode=${selection.mode}`); }} />
          <div className="flex flex-wrap gap-4 text-sm">
            <label>重复次数 <select className={inputStyle} value={prefs.repeats} disabled={saving} onChange={e => changePrefs({ repeats: Number(e.target.value) })}>{[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <label>速度 <select className={inputStyle} value={prefs.speed} disabled={saving} onChange={e => changePrefs({ speed: Number(e.target.value) })}>{[0.5, 0.75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
            <label><input type="checkbox" checked={prefs.autoNext} disabled={saving} onChange={e => changePrefs({ autoNext: e.target.checked })} /> 100% 核对后自动继续</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={saving || !!error} onClick={() => { void go('/feedback'); }}>反馈</Button>
            <Button variant="outline" onClick={() => { void fullscreen(); }}>{focus ? '退出专注' : '全屏 / 专注'}</Button>
            <Button variant="outline" disabled={recordingBusy || saving || !!error || composing} onClick={() => { audio.player.stop(); mutate(s => ({ ...s, finished: true })); }}>结束练习</Button>
          </div>
        </div>
      </details>
      {blocker.state === 'blocked' && <div role="alertdialog" aria-label="保存后离开" className="fixed inset-x-4 bottom-5 z-[70] space-y-3 rounded border bg-[var(--app-surface)] p-5 shadow-xl">
        <p>{recordingBusy ? '请先留在练习，停止并保存录音；保存失败时可下载备份或丢弃未保存录音。' : '草稿或设置正在保存，或保存失败。成功后可继续离开。'}</p>
        <div className="flex gap-2"><Button disabled={recordingBusy || saving || pending} onClick={() => { void retrySave(); }}>重试保存并继续</Button><Button variant="outline" onClick={() => blocker.reset()}>留在练习</Button></div>
      </div>}
    </div>;
}
