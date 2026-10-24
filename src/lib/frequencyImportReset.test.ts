import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), eq: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser }, from: () => ({ delete: () => ({ eq: mocks.eq }) }) } }))
import { clearRemoteLearningData, replaceRemoteLearningDataWithLocal } from './sync'
import { db } from '@/db/schema'
beforeEach(async () => {
  await db.delete(); await db.open()
  vi.clearAllMocks()
  mocks.eq.mockResolvedValue({ error: null })
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'alice', user_metadata: { frequency_import_v1: { id: 'test' } } } }, error: null })
  mocks.updateUser.mockResolvedValue({ error: null })
})
it('preserves the account import when replacing only card and notebook snapshots', async () => {
  await replaceRemoteLearningDataWithLocal('alice')
  expect(mocks.eq).toHaveBeenCalledTimes(2)
  expect(mocks.updateUser).not.toHaveBeenCalled()
})
it('clears the account import when the user explicitly clears learning data', async () => {
  await clearRemoteLearningData('alice')
  expect(mocks.updateUser).toHaveBeenCalledWith({ data: { frequency_import_v1: null } })
})
it('does not clear another account metadata or report a failed reset as success', async () => {
  await expect(clearRemoteLearningData('bob')).rejects.toThrow('账号')
  expect(mocks.updateUser).not.toHaveBeenCalled()
  mocks.updateUser.mockResolvedValue({ error: { message: 'network' } })
  await expect(clearRemoteLearningData('alice')).rejects.toThrow('导入记录')
})
