export function ReadingLoadStatus({ corpusReady, recordsReady, error }: { corpusReady: boolean; recordsReady: boolean; error: string }) {
  if (error || corpusReady && recordsReady) return null
  return <p role="status">{corpusReady ? '正在读取本机学习记录…' : recordsReady ? '正在读取阅读词库…' : '正在读取词库与本机学习记录…'}</p>
}
