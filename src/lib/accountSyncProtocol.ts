export interface CloudRecord { key: string; value: unknown; version: number; modifiedAt: number }
export interface LocalRecord { key: string; value: unknown; baseVersion: number; mutationId: string; modifiedAt: number }
export function serialize(value: unknown): unknown {
  if (value instanceof Date) return { $syncDate: value.toISOString() }
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, serialize(v)]))
  return value
}
export function deserialize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deserialize)
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    if (Object.keys(row).length === 1 && typeof row.$syncDate === 'string') return new Date(row.$syncDate)
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, deserialize(v)]))
  }
  return value
}
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(serialize(a)) === JSON.stringify(serialize(b))
export function reconcile(local: LocalRecord | null, remote: CloudRecord): { value: unknown; pending: LocalRecord | null } {
  if (local && !sameValue(local.value, remote.value) && local.modifiedAt > remote.modifiedAt) {
    return { value: local.value, pending: { ...local, baseVersion: remote.version, mutationId: crypto.randomUUID() } }
  }
  return { value: remote.value, pending: null }
}
