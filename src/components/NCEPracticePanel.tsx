import { useRef, useState } from 'react';
import { AnnotatedSentence } from '@/components/AnnotatedSentence';
import { decodeHtml } from '@/lib/decodeHtml';
import type { AIAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { nceTokens, type NCEComparison } from '@/lib/nceShadowing';
import { validateNCESpans, type NCENameSpan } from '@/lib/nceProperNames';
export function NCERecordingPlaceholder() {
    return <section className="quiet-surface space-y-2 p-4" aria-label="个人录音回放">
    <Button variant="outline" disabled>个人录音回放 · 待开发</Button>
    <p className="text-xs text-[var(--app-muted)]">使用手机输入法的麦克风把朗读转成文字。网页仅对比文字内容准确率，不评价发音质量。</p>
    </section>;
}
const colors = {
    match: 'text-green-700 bg-green-50', substitution: 'text-red-700 bg-red-50', deletion: 'text-orange-700 bg-orange-50', insertion: 'text-red-700 bg-red-50', exempt: 'text-gray-600 bg-gray-100'
};
const labels = {
    match: '正确', substitution: '错误', deletion: '缺漏', insertion: '多出', exempt: '专名免评'
};
export function NCEPracticePanel({ text, translation, hidden, evaluation, spans, onSpans, onEditing, analysis, showAnnotations = false, analysisUnlocked = false, disabled = false }: {
    text: string;
    translation: string;
    hidden: boolean;
    evaluation: NCEComparison | null;
    spans: NCENameSpan[];
    onSpans: (spans: NCENameSpan[]) => void;
    onEditing?: (editing: boolean) => void;
    disabled?: boolean;
    analysis?: AIAnalysis;
    showAnnotations?: boolean;
    analysisUnlocked?: boolean;
}) {
    const editor = useRef<HTMLTextAreaElement>(null);
    const [error, setError] = useState('');
    const reveal = !hidden || !!evaluation;
    function mark(kind: 'person' | 'place') {
        const e = editor.current;
        if (!e)
            return;
        const tokens = nceTokens(text).filter(t => t.start < e.selectionEnd && t.end > e.selectionStart);
        if (!tokens.length || e.selectionStart === e.selectionEnd) {
            setError('请先选中原文中的人名或地名。');
            return;
        }
        const span = {
            start: tokens[0].start, end: tokens.at(-1)!.end, kind
        };
        const next = [...spans.filter(s => s.end <= span.start || s.start >= span.end), span].sort((a, b) => a.start - b.start);
        onSpans(validateNCESpans(text, next));
        setError('');
    }
    return <section className="quiet-surface space-y-4 p-4 md:p-6">
  {reveal ? <>
        {analysis && showAnnotations && analysisUnlocked ? <AnnotatedSentence text={decodeHtml(text)} analysis={analysis} unlocked /> : <p className="text-xl leading-relaxed">{decodeHtml(text)}</p>}
        <p className="text-sm text-[var(--app-muted)]">{translation}</p>
        </> : <p>回忆模式：英文、中文和专名标记将在检查后显示。</p>}
  {evaluation && <div role="status" className="space-y-3">
        <p className="font-medium">{evaluation.score === null ? '本句全部为免评专名，无数值成绩' : `文字内容准确率 ${Math.round(evaluation.score)}%`} · 普通词 {evaluation.normalCount} · 错误 {evaluation.substitutions} / 缺漏 {evaluation.deletions} / 多出 {evaluation.insertions}</p>
        <div className="flex flex-wrap gap-2">{evaluation.diff.map((d, i) => <span key={i} className={`rounded px-2 py-1 text-sm ${colors[d.type]}`}>
            <span className="mr-1 text-xs">{labels[d.type]}</span>{d.type === 'insertion' ? d.answer : d.reference}{d.type === 'substitution' && ` → ${d.answer}`}{d.type === 'exempt' && d.answer && `（${d.answer}）`}</span>)}</div>
        </div>}
  {reveal && <details onToggle={e => onEditing?.(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">专有名词标记 · 人名 / 地名不计分，可修改</summary>
        <div className="mt-3 space-y-3">
        <label className="block text-sm">选中原文中的完整人名或地名<textarea ref={editor} readOnly value={text} rows={3} className="mt-2 w-full rounded border p-3 bg-[var(--app-bg)]"/>
        </label>
        <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => mark('person')}>标为人名</Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => mark('place')}>标为地名</Button>
        <Button size="sm" variant="outline" disabled={disabled || !spans.length} onClick={() => onSpans([])}>取消全部免评</Button>
        </div>
        <p className="text-xs text-[var(--app-muted)]">仅这些原文位置免评；相邻普通词仍计分。输入不同专名或省略专名均可。</p>{spans.map(s => <Button key={`${s.start}:${s.end}`} size="sm" variant="outline" disabled={disabled} onClick={() => onSpans(spans.filter(v => v !== s))}>{text.slice(s.start, s.end)} · {s.kind === 'person' ? '人名' : '地名'} · 取消</Button>)}{error && <p role="alert">{error}</p>}</div>
        </details>}
 </section>;
}
