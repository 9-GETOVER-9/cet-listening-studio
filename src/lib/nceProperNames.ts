export type NCENameSpan = {
    start: number;
    end: number;
    kind: 'person' | 'place';
};
export type NCENameArtifact = {
    version: 'nce-proper-names-v1';
    cards: Record<string, {
        textHash: string;
        spans: NCENameSpan[];
    }>;
};
const wordChar = /[\p{L}\p{N}\p{M}'’＇]/u;
export function validateNCESpans(text: string, value: unknown): NCENameSpan[] {
    if (!Array.isArray(value))
        return [];
    const result: NCENameSpan[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== 'object')
            return [];
        const { start, end, kind } = raw as NCENameSpan;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end || !['person', 'place'].includes(kind))
            return [];
        if (!/[\p{L}\p{N}]/u.test(text.slice(start, end)) || (start > 0 && wordChar.test(text[start - 1])) || (end < text.length && wordChar.test(text[end])) || !wordChar.test(text[start]) || !wordChar.test(text[end - 1]))
            return [];
        result.push({
            start, end, kind
        });
    }
    result.sort((a, b) => a.start - b.start);
    return result.some((span, i) => i > 0 && span.start < result[i - 1].end) ? [] : result;
}
export async function nceTextHash(text: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
}
export async function loadNCEProperNames(fetcher: typeof fetch = fetch): Promise<NCENameArtifact | null> {
    try {
        const response = await fetcher('/data/nce-proper-names-v1.json');
        if (!response.ok)
            return null;
        const data = await response.json();
        return data?.version === 'nce-proper-names-v1' && data.cards && typeof data.cards === 'object' ? data : null;
    }
    catch {
        return null;
    }
}
export async function namesForCard(artifact: NCENameArtifact | null, id: string, text: string): Promise<NCENameSpan[]> {
    const record = artifact?.cards[id];
    if (!record)
        return [];
    try {
        return record.textHash === await nceTextHash(text) ? validateNCESpans(text, record.spans) : [];
    }
    catch {
        return [];
    }
}

export async function resolveNCENameSpans(artifact: NCENameArtifact | null, id: string, text: string, manual: NCENameSpan[] | null): Promise<NCENameSpan[]> {
    // Saved session spans are a snapshot, never a seed authority. An explicit
    // owner override (including []) wins; otherwise always validate today's seed.
    return manual !== null ? validateNCESpans(text, manual) : namesForCard(artifact, id, text);
}