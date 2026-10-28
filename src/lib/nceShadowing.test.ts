import { expect, it } from 'vitest';
const modules = import.meta.glob('./nceShadowing.ts');
async function api() { expect(modules['./nceShadowing.ts'], 'shadowing comparison core must exist').toBeDefined(); return await modules['./nceShadowing.ts']() as typeof import('./nceShadowing'); }
it('normalizes punctuation, case, NFKC, contractions and explicit numeral equivalents', async () => {
    const p = await api();
    expect(p.compareNCEText("I'm twenty-one, and I can't go.", 'Ｉ am 21 and I cannot go').score).toBe(100);
});
it('does not stem ordinary words or globally exempt capitalized text', async () => {
    const p = await api();
    expect(p.compareNCEText('John lives in London', 'John live in London').substitutions).toBe(1);
    expect(p.compareNCEText('The British Museum is open', 'the wrong museum is open').score).toBe(80);
});
it('exempts only positional person/place spans without swallowing neighboring errors', async () => {
    const p = await api();
    const text = 'John lives in London';
    const spans = [{ start: 0, end: 4, kind: 'person' as const }, { start: 14, end: 20, kind: 'place' as const }];
    expect(p.compareNCEText(text, 'Jack lives in Paris', spans).score).toBe(100);
    expect(p.compareNCEText(text, 'lives in', spans).score).toBe(100);
    const wrong = p.compareNCEText(text, 'dies in', spans);
    expect(wrong.substitutions).toBe(1);
    expect(wrong.score).toBe(50);
});
it('keeps multiword name exemptions finite and ordered insertions and deletions visible', async () => {
    const p = await api();
    const r = p.compareNCEText('John Smith lives here', 'Jack Brown dies here now', [{ start: 0, end: 10, kind: 'person' }]);
    expect(r.score).toBe(0);
    expect(r.insertions).toBe(1);
    expect(r.substitutions).toBe(1);
    const repeat = p.compareNCEText('go go home', 'go home now');
    expect(repeat.diff.map(d => d.type)).toContain('deletion');
    expect(repeat.diff.at(-1)?.type).toBe('insertion');
});
it('gives no numerical score for all-exempt text and rejects empty answers', async () => {
    const p = await api();
    expect(p.compareNCEText('John', 'Jack', [{ start: 0, end: 4, kind: 'person' }]).score).toBeNull();
    expect(p.canCheckNCE('  ', false)).toBe(false);
    expect(p.canCheckNCE('answer', true)).toBe(false);
});
it('preserves omitted multiword names and ordinary negation, repeated words and possessive names', async () => {
    const p = await api();
    const spans = [{ start: 0, end: 4, kind: 'person' as const }, { start: 14, end: 22, kind: 'place' as const }];
    expect(p.compareNCEText('John lives in New York.', 'lives in', spans).score).toBe(100);
    expect(p.compareNCEText('John lives in New York.', 'John live in New York.', spans).substitutions).toBe(1);
    const r = p.compareNCEText('John is not here', 'Jack is here', [{ start: 0, end: 4, kind: 'person' }]);
    expect(r.deletions).toBe(1);
    expect(r.diff.find(d => d.type === 'deletion')?.reference).toBe('not');
    expect(p.compareNCEText("John's book is here", 'book is here', [{ start: 0, end: 6, kind: 'person' }]).score).toBe(100);
});
it('retains a long input draft while refusing oversized comparison instead of silently truncating', async () => { const p = await api(); const long = 'word '.repeat(1000); expect(p.canCheckNCE(long, false)).toBe(false); expect(() => p.compareNCEText('a sentence', long)).toThrow('4000'); });
it('normalizes hundred and thousand integer phrases without conflating repeated single numerals', async () => { const p = await api(); expect(p.compareNCEText('one hundred and twenty-three', '123').score).toBe(100); expect(p.compareNCEText('two thousand and five', '2005').score).toBe(100); expect(p.compareNCEText('one two', '3').score).not.toBe(100); });
it('ignores possessive punctuation after explicit contraction expansion', async () => { const p = await api(); expect(p.compareNCEText("Helen's book", 'Helens book').score).toBe(100); });
it('only admits original NCE sentences', async () => { const p = await api(); const base = { level: 'NCE' as const, moduleId: 'NCE-Book2-001' }; expect(p.isOriginalNCESentence(base)).toBe(true); expect(p.isOriginalNCESentence({ ...base, isTitle: true })).toBe(false); expect(p.isOriginalNCESentence({ ...base, isMerged: true })).toBe(false); expect(p.isOriginalNCESentence({ ...base, level: 'CET4' })).toBe(false); });

it('accepts grouped numeral punctuation for explicit integer equivalents',async()=>{const p=await api();expect(p.compareNCEText('two thousand and five','2,005').score).toBe(100)})

it('normalizes fullwidth apostrophes and combining graphemes before lexing while retaining original UTF16 name spans',async()=>{
 const p=await api();expect(p.compareNCEText("I can't go.",'Ｉ ｃａｎ＇ｔ ｇｏ．').score).toBe(100);expect(p.compareNCEText('Café is here','Cafe\u0301 is here').score).toBe(100);const original='Ｊｏｈｎ＇ｓ book';const tokens=p.nceTokens(original);expect(tokens[0]).toMatchObject({start:0,end:6,text:'Ｊｏｈｎ＇ｓ'});expect(p.compareNCEText(original,'book',[{start:0,end:6,kind:'person'}]).score).toBe(100)
})
it('normalizes recursively decreasing billion/million/thousand integer groups without dropping a group',async()=>{const p=await api();expect(p.compareNCEText('one billion two hundred million three hundred thousand four hundred','1,200,300,400').score).toBe(100)})