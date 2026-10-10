import { expect, it } from 'vitest';
const modules = import.meta.glob('./nceProperNames.ts');
async function api() { expect(modules['./nceProperNames.ts'], 'hash-validated proper-name loader must exist').toBeDefined(); return await modules['./nceProperNames.ts']() as typeof import('./nceProperNames'); }
it('accepts exact positional spans and rejects stale hashes, overlap, partial tokens and unsupported kinds', async () => {
    const p = await api();
    const text = 'John in London';
    const hash = await p.nceTextHash(text);
    const seed: import('./nceProperNames').NCENameArtifact = { version: 'nce-proper-names-v1', cards: { c: { textHash: hash, spans: [{ start: 0, end: 4, kind: 'person' }, { start: 8, end: 14, kind: 'place' }] } } };
    expect(await p.namesForCard(seed, 'c', text)).toHaveLength(2);
    expect(await p.namesForCard(seed, 'c', text + '!')).toEqual([]);
    expect(p.validateNCESpans(text, [{ start: 1, end: 4, kind: 'person' }])).toEqual([]);
    expect(p.validateNCESpans(text, [{ start: 0, end: 4, kind: 'person' }, { start: 0, end: 4, kind: 'place' }])).toEqual([]);
});
it('allows optional artifact failure and never guesses names from capitals', async () => { const p = await api(); expect(await p.loadNCEProperNames(async () => { throw new Error('offline'); })).toBeNull(); expect(await p.namesForCard(null, 'c', 'John London')).toEqual([]); });

it('uses current seed artifact after restore and only explicit manual overrides supersede current seeds',async()=>{
 const p=await api();const text='John is here',textHash=await p.nceTextHash(text),spans=[{start:0,end:4,kind:'person' as const}];const seed:import('./nceProperNames').NCENameArtifact={version:'nce-proper-names-v1',cards:{c:{textHash,spans}}};expect(await p.resolveNCENameSpans(seed,'c',text,null)).toEqual(spans);expect(await p.resolveNCENameSpans(seed,'c',text,[])).toEqual([]);expect(await p.resolveNCENameSpans(null,'c',text,null)).toEqual([])
})