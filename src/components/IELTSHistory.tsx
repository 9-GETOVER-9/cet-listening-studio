import { useLiveQuery } from 'dexie-react-hooks'
import { readIELTSHistory } from '@/lib/ieltsHistory'

export function IELTSHistory({ owner }: { owner: string }) {
  const data = useLiveQuery(async () => {
    try { return { records: await readIELTSHistory(owner), error: false } }
    catch { return { records: [], error: true } }
  }, [owner])
  return <section className="quiet-surface p-5 md:p-8" aria-label="听写成绩日志">
    <h2 className="text-xl font-semibold">听写成绩日志</h2>
    <p className="mt-2 text-sm text-[var(--app-muted)]">保存在当前浏览器，刷新后可查看；暂不跨设备同步。{owner === 'guest' ? '当前为访客记录。' : '按当前登录账号分别保存。'}</p>
    {!data ? <p className="mt-4 text-sm">正在读取日志…</p> : data.error ? <p role="alert" className="mt-4 text-sm text-red-600">无法读取本机日志，请检查浏览器存储权限后刷新。</p> : !data.records.length ? <p className="mt-4 text-sm text-[var(--app-muted)]">还没有成绩。完成听写，或确认至少一题后结束本轮，会自动保存。</p> :
      <div className="mt-4 max-h-96 overflow-y-auto divide-y divide-[var(--app-line)]">
        {data.records.map(record => <div key={record.id} className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0"><p className="font-medium">{record.book==='personal'?`个人生词 · ${record.groupLabel??'生词'}`:record.book==='network'?`网络雅思 · 第 ${record.chapter} 章`:record.book === 'wanglu' ? `王陆 · 第 ${record.chapter} 章` : `雅思高频 · Unit ${record.chapter}`} · {record.section === 'all' ? '全部小节' : record.section}</p>
            <p className="mt-1 text-xs text-[var(--app-muted)]">{new Date(record.finishedAt).toLocaleString('zh-CN')} · {record.practice ? '错题重练 · ' : ''}{record.completed ? '完成' : '提前结束'}</p>
            <p className="mt-1 text-sm text-[var(--app-muted)]">通过 {record.passed} · 不通过 {record.failed} · 已确认 {record.answered} / {record.total} 题</p></div>
          <p className="shrink-0 text-xl font-semibold">{record.accuracy}%</p>
        </div>)}
      </div>}
  </section>
}
