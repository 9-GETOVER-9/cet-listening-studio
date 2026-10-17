import { Button } from '@/components/ui/button';
import type { Module } from '@/types';
import type { NCERange } from '@/lib/nceShadowingStore';
const inputStyle = 'rounded border border-[var(--app-line)] bg-[var(--app-surface)] p-2';
function positive(value: string, fallback: number) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}
interface ScopeProps {
    moduleId: string;
    lessons: Module[];
    selection: NCERange;
    count: number;
    hideTitles: boolean;
    disabled: boolean;
    onSelection: (selection: NCERange) => void;
    onLesson: (moduleId: string) => void;
    onApply: () => void;
}
export function NCEScopeControls({ moduleId, lessons, selection, count, hideTitles, disabled, onSelection, onLesson, onApply }: ScopeProps) {
    return <div className="flex flex-wrap gap-3">
  <label>选择课文
   <select className={`${inputStyle} max-w-full`} value={moduleId} disabled={disabled} onChange={e => onLesson(e.target.value)}>
    {lessons.map(m => <option key={m.moduleId} value={m.moduleId}>Lesson {m.lessonNum}{hideTitles ? '' : ` · ${m.lessonTitle}`}</option>)}
   </select>
  </label>
  <label>起始句
   <input className={`${inputStyle} w-20`} type="number" min={1} max={count} value={selection.start} disabled={disabled} onChange={e => onSelection({
        ...selection, start: positive(e.target.value, 1)
    })}/>
  </label>
  <label>结束句
   <input className={`${inputStyle} w-20`} type="number" min={selection.start} max={count} value={selection.end} disabled={disabled} onChange={e => onSelection({
        ...selection, end: positive(e.target.value, count)
    })}/>
  </label>
  <label>练习模式
   <select className={inputStyle} value={selection.mode} disabled={disabled} onChange={e => onSelection({
        ...selection, mode: e.target.value as NCERange['mode']
    })}>
    <option value="visible">看原文跟读</option>
    <option value="hidden">隐藏原文回忆</option>
   </select>
  </label>
  <Button variant="outline" disabled={disabled || selection.start > selection.end || selection.end > count} onClick={onApply}>应用范围</Button>
 </div>;
}
