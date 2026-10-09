import { describe, expect, it, vi } from 'vitest'
import { createLearningSourceSyncActions, createLearningSyncRunner } from './learningSync'

describe('learning sync runner', () => {
  it('pulls remote progress before refreshing stats and uploading pending local reviews', async () => {
    const calls: string[] = []
    const runLearningSync = createLearningSyncRunner({
      getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
      isOnline: () => true,
      mergeRemoteDataToLocal: vi.fn().mockImplementation(async () => {
        calls.push('merge')
        return { cardsMerged: 2, notebooksMerged: 0 }
      }),
      refreshModuleStats: vi.fn().mockImplementation(async () => {
        calls.push('refresh-stats')
      }),
      processReviewOutbox: vi.fn().mockImplementation(async () => {
        calls.push('process-outbox')
      }),
      uploadLocalSnapshot: vi.fn().mockImplementation(async () => {
        calls.push('upload-snapshot')
      }),
    })

    const result = await runLearningSync()

    expect(result).toEqual({
      skipped: false,
      cardsMerged: 2,
      notebooksMerged: 0,
    })
    expect(calls).toEqual(['merge', 'refresh-stats', 'process-outbox', 'upload-snapshot'])
  })

  it('skips cloud sync when no user is signed in', async () => {
    const mergeRemoteDataToLocal = vi.fn()
    const runLearningSync = createLearningSyncRunner({
      getCurrentUserId: vi.fn().mockResolvedValue(null),
      isOnline: () => true,
      mergeRemoteDataToLocal,
      refreshModuleStats: vi.fn(),
      processReviewOutbox: vi.fn(),
    })

    const result = await runLearningSync()

    expect(result).toEqual({ skipped: true, reason: 'signed-out' })
    expect(mergeRemoteDataToLocal).not.toHaveBeenCalled()
  })

  it('does not upload local progress when the remote merge fails', async () => {
    const uploadLocalSnapshot = vi.fn()
    const runLearningSync = createLearningSyncRunner({
      getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
      isOnline: () => true,
      mergeRemoteDataToLocal: vi.fn().mockRejectedValue(new Error('remote unavailable')),
      refreshModuleStats: vi.fn(),
      processReviewOutbox: vi.fn(),
      uploadLocalSnapshot,
    })

    await expect(runLearningSync()).rejects.toThrow('remote unavailable')
    expect(uploadLocalSnapshot).not.toHaveBeenCalled()
  })
})

describe('source sync actions', () => {
  it('uploads this device as the cloud source of truth', async () => {
    const replaceRemoteLearningDataWithLocal = vi.fn().mockResolvedValue({
      cardsUploaded: 3,
      notebooksUploaded: 1,
    })
    const { uploadThisDeviceAsSource } = createLearningSourceSyncActions({
      getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
      isOnline: () => true,
      replaceRemoteLearningDataWithLocal,
      replaceLocalDataWithRemote: vi.fn(),
      refreshModuleStats: vi.fn(),
      markSnapshotUploaded: vi.fn(),
    })

    const result = await uploadThisDeviceAsSource()

    expect(replaceRemoteLearningDataWithLocal).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({
      skipped: false,
      cardsUploaded: 3,
      notebooksUploaded: 1,
    })
  })

  it('downloads the cloud source of truth and refreshes local stats', async () => {
    const calls: string[] = []
    const { downloadCloudToThisDevice } = createLearningSourceSyncActions({
      getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
      isOnline: () => true,
      replaceRemoteLearningDataWithLocal: vi.fn(),
      replaceLocalDataWithRemote: vi.fn().mockImplementation(async () => {
        calls.push('download')
        return { cardsApplied: 3, cardsReset: 1, notebooksApplied: 1 }
      }),
      refreshModuleStats: vi.fn().mockImplementation(async () => {
        calls.push('refresh-stats')
      }),
      markSnapshotUploaded: vi.fn(),
    })

    const result = await downloadCloudToThisDevice()

    expect(calls).toEqual(['download', 'refresh-stats'])
    expect(result).toEqual({
      skipped: false,
      cardsApplied: 3,
      cardsReset: 1,
      notebooksApplied: 1,
    })
  })
})
