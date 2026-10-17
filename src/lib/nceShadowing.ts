import { validateNCESpans, type NCENameSpan } from './nceProperNames';
export type NCEDiff = {
    type: 'match' | 'substitution' | 'deletion' | 'insertion' | 'exempt';
    reference: string;
    answer: string;
};
export type NCEComparison = {
    score: number | null;
    normalCount: number;
    substitutions: number;
    deletions: number;
    insertions: number;
    diff: NCEDiff[];
};
type Token = {
    value: string;
    text: string;
    start: number;
    end: number;
};
const contractions: Record<string,
    string> = {
    "i'm": 'i am',
    "you're": 'you are',
    "we're": 'we are',
    "they're": 'they are',
    "he's": 'he is',
    "she's": 'she is',
    "it's": 'it is',
    "that's": 'that is',
    "there's": 'there is',
    "can't": 'cannot',
    "cannot": 'can not',
    "won't": 'will not',
    "shan't": 'shall not',
    "isn't": 'is not',
    "aren't": 'are not',
    "wasn't": 'was not',
    "weren't": 'were not',
    "don't": 'do not',
    "doesn't": 'does not',
    "didn't": 'did not',
    "haven't": 'have not',
    "hasn't": 'has not',
    "hadn't": 'had not',
    "wouldn't": 'would not',
    "couldn't": 'could not',
    "shouldn't": 'should not',
    "mustn't": 'must not',
    "let's": 'let us'
};
const numbers: Record<string,
    number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90
};
export function nceTokens(text: string): Token[] {
    const words: Token[] = [];
    // Normalize before lexing. Grapheme mapping keeps names and UI selection bound
    // to exact original UTF-16 offsets even when NFKC changes a grapheme's length.
    let normalized = '';
    const starts: number[] = [];
    const ends: number[] = [];
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    for (const segment of segments) {
        const normalizedSegment = segment.segment.normalize('NFKC');
        normalized += normalizedSegment;
        for (let index = 0; index < normalizedSegment.length; index++) {
            starts.push(segment.index);
            ends.push(segment.index + segment.segment.length);
        }
    }
    for (const match of normalized.matchAll(/[\p{N}]+(?:,[\p{N}]{3})+|[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu)) {
        const start = starts[match.index!];
        const end = ends[match.index! + match[0].length - 1];
        const base = match[0].normalize('NFKC').toLowerCase().replaceAll('’', "'");
        const plain = /^[0-9]+(?:,[0-9]{3})+$/.test(base) ? base.replaceAll(',', '') : base;
        let expanded = contractions[plain] || plain;
        if (base.endsWith("'ll"))
            expanded = base.slice(0, -3) + ' will';
        if (base.endsWith("'ve"))
            expanded = base.slice(0, -3) + ' have';
        if (base.endsWith("'re"))
            expanded = base.slice(0, -3) + ' are';
        // 'd and possessive 's are ambiguous and remain literal.
        if (expanded === 'cannot')
            expanded = 'can not';
        for (const value of expanded.split(' '))
            words.push({
                value: value.replaceAll("\u0027", ""), text: text.slice(start, end), start, end
            });
    }
    const result: Token[] = [];
    function small(start: number): {
        value: number;
        end: number;
    } | null {
        const value = numbers[words[start]?.value];
        if (value === undefined)
            return null;
        if (value >= 20 && numbers[words[start + 1]?.value] > 0 && numbers[words[start + 1]?.value] < 10)
            return {
                value: value + numbers[words[start + 1].value], end: start + 2
            };
        return {
            value, end: start + 1
        };
    }
    function hundred(start: number): {
        value: number;
        end: number;
    } | null {
        const base = small(start);
        if (!base)
            return null;
        if (base.value >= 1 && base.value <= 9 && words[base.end]?.value === 'hundred') {
            let end = base.end + 1;
            const and = words[end]?.value === 'and';
            const tail = small(end + (and ? 1 : 0));
            if (tail && tail.value < 100) {
                end = tail.end;
                return {
                    value: base.value * 100 + tail.value, end
                };
            }
            return {
                value: base.value * 100, end
            };
        }
        return base;
    }
    const scales: Record<string, number> = {
        thousand: 1000, million: 1000000, billion: 1000000000
    };
    for (let i = 0; i < words.length; i++) {
        const token = words[i];
        const group = hundred(i);
        if (!group) {
            result.push({
                ...token, value: /^\d+$/.test(token.value) ? String(Number(token.value)) : token.value
            });
            continue;
        }
        let value = group.value;
        let end = group.end;
        if (scales[words[end]?.value]) {
            value = 0;
            let current = group;
            let previousScale = Infinity;
            while (current) {
                const scale = scales[words[current.end]?.value];
                if (!scale || scale >= previousScale) break;
                value += current.value * scale;
                previousScale = scale;
                end = current.end + 1;
                const tail = hundred(end + (words[end]?.value === 'and' ? 1 : 0));
                if (!tail) break;
                const nextScale = scales[words[tail.end]?.value];
                if (!nextScale) {
                    value += tail.value;
                    end = tail.end;
                    break;
                }
                if (nextScale >= previousScale) break;
                current = tail;
            }
        }
        result.push({
            ...token, value: String(value), text: text.slice(token.start, words[end - 1].end), end: words[end - 1].end
        });
        i = end - 1;
    }
    return result;
}
export const NCE_MAX_INPUT = 4000;
export function canCheckNCE(draft: string, composing: boolean) {
    return !composing && draft.length <= NCE_MAX_INPUT && nceTokens(draft).length > 0;
}
export function compareNCEText(reference: string, answer: string, spans: NCENameSpan[] = []): NCEComparison {
    if (answer.length > NCE_MAX_INPUT)
        throw new Error('单句输入超过 4000 字符，请精简后检查；草稿不会截断。');
    const valid = validateNCESpans(reference, spans);
    const tokens = nceTokens(reference);
    const input = nceTokens(answer);
    const units: {
        tokens: Token[];
        exempt: boolean;
    }[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const span = valid.find(s => token.start >= s.start && token.end <= s.end);
        if (span) {
            const group: Token[] = [token];
            while (tokens[i + 1] && tokens[i + 1].end <= span.end)
                group.push(tokens[++i]);
            units.push({
                tokens: group, exempt: true
            });
        }
        else
            units.push({
                tokens: [token], exempt: false
            });
    }
    // Each cell stores a predecessor, rather than a copy of the entire partial diff.
    // This keeps memory proportional to the reference × answer token grid.
    type Cell = {
        cost: number;
        matches: number;
        deletions: number;
        namePenalty: number;
        previous: [
            number,
            number
        ] | null;
        step: NCEDiff | null;
    };
    const table: (Cell | undefined)[][] = Array.from({
        length: units.length + 1
    }, () => Array(input.length + 1));
    table[0][0] = {
        cost: 0, matches: 0, deletions: 0, namePenalty: 0, previous: null, step: null
    };
    function offer(i: number, j: number, cell: Cell) {
        const old = table[i][j];
        const improves = !old || (cell.cost !== old.cost ? cell.cost < old.cost
            : cell.matches !== old.matches ? cell.matches > old.matches
            : cell.deletions !== old.deletions ? cell.deletions < old.deletions
            : cell.namePenalty < old.namePenalty);
        if (improves) table[i][j] = cell;
    }
    for (let i = 0; i <= units.length; i++)
        for (let j = 0; j <= input.length; j++) {
            const c = table[i][j];
            if (!c)
                continue;
            if (j < input.length)
                offer(i, j + 1, {
                    ...c, cost: c.cost + 1, previous: [i, j], step: {
                        type: 'insertion', reference: '', answer: input[j].text
                    }
                });
            const u = units[i];
            if (!u)
                continue;
            if (u.exempt) {
                // Exemptions are positional and finite: no more than the original name's token count.
                // Primary ordinary edit cost, ordinary matches, then fewer ordinary deletions win.
                // Exact name anchors break remaining ties; no capital-word heuristic is involved.
                for (let size = 0; size <= Math.min(u.tokens.length, input.length - j); size++) {
                    const taken = input.slice(j, j + size);
                    const exact = taken.map(t => t.value).join(' ') === u.tokens.map(t => t.value).join(' ');
                    offer(i + 1, j + size, {
                        ...c, namePenalty: c.namePenalty + (exact ? 0 : size + 1), previous: [i, j], step: {
                            type: 'exempt', reference: reference.slice(u.tokens[0].start, u.tokens.at(-1)!.end), answer: taken.map(t => t.text).join(' ')
                        }
                    });
                }
            }
            else {
                const token = u.tokens[0];
                offer(i + 1, j, {
                    ...c, cost: c.cost + 1, deletions: c.deletions + 1, previous: [i, j], step: {
                        type: 'deletion', reference: token.text, answer: ''
                    }
                });
                if (j < input.length) {
                    const equal = token.value === input[j].value;
                    offer(i + 1, j + 1, {
                        ...c, cost: c.cost + (equal ? 0 : 1), matches: c.matches + (equal ? 1 : 0), previous: [i, j], step: {
                            type: equal ? 'match' : 'substitution', reference: token.text, answer: input[j].text
                        }
                    });
                }
            }
        }
    const diff: NCEDiff[] = [];
    let i = units.length;
    let j = input.length;
    while (table[i][j]?.previous) {
        const cell = table[i][j]!;
        diff.push(cell.step!);
        [i, j] = cell.previous!;
    }
    diff.reverse();
    const normalCount = units.filter(u => !u.exempt).length;
    const substitutions = diff.filter(d => d.type === 'substitution').length;
    const deletions = diff.filter(d => d.type === 'deletion').length;
    const insertions = diff.filter(d => d.type === 'insertion').length;
    return {
        normalCount, substitutions, deletions, insertions, diff, score: normalCount ? Math.max(0, 1 - (substitutions + deletions + insertions) / normalCount) * 100 : null
    };
}
export function isOriginalNCESentence(card: {
    level: string;
    isTitle?: boolean;
    isMerged?: boolean;
}) {
    return card.level === 'NCE' && !card.isTitle && !card.isMerged;
}
