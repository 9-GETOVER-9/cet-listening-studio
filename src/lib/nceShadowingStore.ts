import { db } from '@/db/schema';
import { compareNCEText, canCheckNCE, type NCEComparison } from './nceShadowing';
import { nceTextHash, validateNCESpans, type NCENameSpan } from './nceProperNames';
export type NCERange = {
    start: number;
    end: number;
    mode: 'visible' | 'hidden';
};
export type NCEPreferences = {
    speed: number;
    repeats: number;
    muted: boolean;
    autoNext: boolean;
    goal: number;
    showAnalysis: boolean;
};
export const defaultNCEPreferences: NCEPreferences = {
    speed: 1, repeats: 1, muted: false, autoNext: false, goal: 10, showAnalysis: false
};
export type NCEAttempt = {
    score: number | null;
    answer: string;
    checkedAt: number;
    comparison: NCEComparison;
    signature: string;
};
export type NCESession = {
    owner: string;
    moduleId: string;
    context: string;
    sessionId: string;
    range: NCERange;
    queue: string[];
    position: number;
    draft: string;
    drafts: Record<string, string>;
    textHashes: Record<string, string>;
    revision: number;
    evaluation: NCEAttempt | null;
    results: Record<string, {
        first: NCEAttempt;
        attempts: NCEAttempt[];
    }>;
    spans: Record<string, NCENameSpan[]>;
    elapsed: number;
    preferences: NCEPreferences;
    finished: boolean;
};
export function nceContext(moduleId: string, range: NCERange) {
    return JSON.stringify([moduleId, range.start, range.end, range.mode]);
}
function sessionKey(owner: string, context: string) {
    return `nce-shadowing:session:${JSON.stringify([owner, context])}`;
}
export function createNCESession(owner: string, moduleId: string, range: NCERange, queue: string[]): NCESession {
    return {
        owner, moduleId, context: nceContext(moduleId, range), sessionId: crypto.randomUUID(), range, queue: [...queue], position: 0, draft: '', drafts: {}, textHashes: {}, revision: 0, evaluation: null, results: {}, spans: {}, elapsed: 0, preferences: {
            ...defaultNCEPreferences
        }, finished: false
    };
}
export function editNCEDraft(session: NCESession, draft: string): NCESession {
    return {
        ...session, draft, revision: session.revision + 1, evaluation: null
    };
}
export function editNCESpans(session: NCESession, id: string, text: string, spans: NCENameSpan[]): NCESession {
    return {
        ...session, spans: {
            ...session.spans, [id]: validateNCESpans(text, spans)
        }, revision: session.revision + 1, evaluation: null
    };
}
export async function saveNCESession(session: NCESession) {
    await db.settings.put({
        key: sessionKey(session.owner, session.context), value: session
    });
}
export async function readNCESession(owner: string, context: string): Promise<NCESession | null> {
    const value = (await db.settings.get(sessionKey(owner, context)))?.value as NCESession | undefined;
    return value?.owner === owner && value.context === context ? value : null;
}
export async function readNCECompleted(owner: string, now = new Date()): Promise<number> {
    const date = now.toDateString();
    return (await db.settings.filter(r => r.key.startsWith(`nce-shadowing:receipt:${JSON.stringify(owner)}:`)).toArray()).filter(r => {
        const stamp = (r.value as {
            checkedAt: number;
        }).checkedAt;
        return new Date(stamp).toDateString() === date;
    }).length;
}
export async function checkNCESession(session: NCESession, text: string, active = () => true): Promise<NCESession> {
    const id = session.queue[session.position];
    if (session.finished || !id || !canCheckNCE(session.draft, false))
        return session;
    if (!active())
        throw new Error('会话已切换');
    const spans = session.spans[id] || [];
    const textHash = await nceTextHash(text);
    const signature = JSON.stringify([session.draft, spans, textHash]);
    const prior = session.results[id];
    if (session.evaluation?.signature === signature)
        return session;
    const comparison = compareNCEText(text, session.draft, spans);
    const attempt: NCEAttempt = {
        score: comparison.score, answer: session.draft, checkedAt: Date.now(), comparison, signature
    };
    const next = {
        ...session, textHashes: {
            ...session.textHashes, [id]: textHash
        }, evaluation: attempt, results: {
            ...session.results, [id]: {
                first: prior?.first || attempt, attempts: [...(prior?.attempts || []), attempt]
            }
        }
    };
    return db.transaction('rw', db.settings, async () => {
        if (!active())
            throw new Error('会话已切换');
        const canonical = await readNCESession(session.owner, session.context);
        if (canonical?.sessionId === session.sessionId && canonical.results[id]?.attempts.at(-1)?.signature === signature && canonical.evaluation?.signature === signature)
            return canonical;
        const key = `nce-shadowing:receipt:${JSON.stringify(session.owner)}:${session.sessionId}:${id}`;
        if (!await db.settings.get(key))
            await db.settings.put({
                key, value: {
                    checkedAt: attempt.checkedAt
                }
            });
        await saveNCESession(next);
        return next;
    });
}
export function moveNCESession(session: NCESession, direction: number): NCESession {
    const position = Math.max(0, Math.min(session.queue.length - 1, session.position + direction));
    const drafts = {
        ...session.drafts, [session.queue[session.position]]: session.draft
    };
    const draft = drafts[session.queue[position]] || '';
    const evaluation = session.results[session.queue[position]]?.attempts.at(-1) || null;
    return {
        ...session, position, drafts, draft, finished: false, revision: session.revision + 1, evaluation: evaluation?.signature === JSON.stringify([draft, session.spans[session.queue[position]] || [], session.textHashes[session.queue[position]]]) ? evaluation : null
    };
}
export function nceAutoNextAllowed(session: NCESession | null, blocked: {
    hidden: boolean;
    composing: boolean;
    saving: boolean;
    pending: boolean;
    error: boolean;
    editing: boolean;
    locked?: boolean;
}) {
    return !!session && !session.finished && session.preferences.autoNext && session.evaluation?.score === 100 && !Object.values(blocked).some(Boolean);
}
function namesKey(owner: string, id: string) {
    return `nce-shadowing:names:${JSON.stringify([owner, id])}`;
}
export async function saveNCENameOverride(owner: string, id: string, text: string, spans: NCENameSpan[]) {
    await db.settings.put({
        key: namesKey(owner, id), value: {
            textHash: await nceTextHash(text), spans: validateNCESpans(text, spans)
        }
    });
}
export async function readNCENameOverride(owner: string, id: string, text: string): Promise<NCENameSpan[] | null> {
    const value = (await db.settings.get(namesKey(owner, id)))?.value as {
        textHash: string;
        spans: unknown;
    } | undefined;
    return value && value.textHash === await nceTextHash(text) ? validateNCESpans(text, value.spans) : null;
}
export function reconcileNCESessionSources(session: NCESession, textHashes: Record<string, string>, spans: Record<string, NCENameSpan[]>): NCESession {
    const id = session.queue[session.position];
    const changed = session.textHashes[id] !== textHashes[id] || JSON.stringify(session.spans[id] || []) !== JSON.stringify(spans[id] || []);
    return {
        ...session, textHashes, spans, evaluation: changed ? null : session.evaluation
    };
}

export async function readNCEActiveSession(
    owner: string,
    context: string,
    current: () => NCESession | null,
    read: typeof readNCESession = readNCESession,
): Promise<NCESession | null> {
    const matches = (session: NCESession | null) => session?.owner === owner && session.context === context;
    const before = current();
    if (matches(before)) return before;
    const restored = await read(owner, context);
    // A mounted exercise may have received edits while IndexedDB was reading.
    // The live snapshot owns unsaved work; a late database reply cannot replace it.
    const after = current();
    return matches(after) ? after : restored;
}
export function selectNCEHydrationSnapshot(owner: string, context: string, restored: NCESession | null, live: NCESession | null): NCESession | null {
    // The caller performs this selection synchronously after its final await.
    // A helper's resolved snapshot can already be stale across that await gap.
    return live?.owner === owner && live.context === context ? live : restored;
}