import { syncModuleStats } from '@/db/crud'
import { processReviewOutboxForCurrentUser } from '@/lib/reviewSync'
import {
  fullUpload,
  mergeRemoteDataToLocal,
  replaceLocalDataWithRemote,
  replaceRemoteLearningDataWithLocal,
} from '@/lib/sync'
import { supabase } from '@/lib/supabase'

const SNAPSHOT_UPLOAD_INTERVAL_MS = 10 * 60_000

export type LearningSyncResult =
  | {
      skipped: false
      cardsMerged: number
      notebooksMerged: number
    }
  | {
      skipped: true
      reason: 'offline' | 'signed-out'
    }

export type UploadThisDeviceResult =
  | {
      skipped: false
      cardsUploaded: number
      notebooksUploaded: number
    }
  | {
      skipped: true
      reason: 'offline' | 'signed-out'
    }

export type DownloadCloudResult =
  | {
      skipped: false
      cardsApplied: number
      cardsReset: number
      notebooksApplied: number
    }
  | {
      skipped: true
      reason: 'offline' | 'signed-out'
    }

interface LearningSyncRunnerDeps {
  getCurrentUserId: () => Promise<string | null>
  isOnline: () => boolean
  mergeRemoteDataToLocal: (userId: string) => Promise<{
    cardsMerged: number
    notebooksMerged: number
  }>
  refreshModuleStats: () => Promise<void>
  processReviewOutbox: () => Promise<void>
  uploadLocalSnapshot?: (userId: string) => Promise<void>
}

interface LearningSourceSyncDeps {
  getCurrentUserId: () => Promise<string | null>
  isOnline: () => boolean
  replaceRemoteLearningDataWithLocal: (userId: string) => Promise<{
    cardsUploaded: number
    notebooksUploaded: number
  }>
  replaceLocalDataWithRemote: (userId: string) => Promise<{
    cardsApplied: number
    cardsReset: number
    notebooksApplied: number
  }>
  refreshModuleStats: () => Promise<void>
  markSnapshotUploaded: (userId: string) => void
}

export function createLearningSyncRunner(deps: LearningSyncRunnerDeps): () => Promise<LearningSyncResult> {
  let inFlight: Promise<LearningSyncResult> | null = null

  const run = async (): Promise<LearningSyncResult> => {
    if (!deps.isOnline()) {
      return { skipped: true, reason: 'offline' }
    }

    const userId = await deps.getCurrentUserId()
    if (!userId) {
      return { skipped: true, reason: 'signed-out' }
    }

    const result = await deps.mergeRemoteDataToLocal(userId)
    if (result.cardsMerged > 0) {
      await deps.refreshModuleStats()
    }

    await deps.processReviewOutbox()
    await deps.uploadLocalSnapshot?.(userId)

    return {
      skipped: false,
      cardsMerged: result.cardsMerged,
      notebooksMerged: result.notebooksMerged,
    }
  }

  return () => {
    if (inFlight) return inFlight
    inFlight = run().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}

async function getReadyUserId(
  getCurrentUserId: () => Promise<string | null>,
  isOnline: () => boolean,
): Promise<{ skipped: true; reason: 'offline' | 'signed-out' } | { skipped: false; userId: string }> {
  if (!isOnline()) {
    return { skipped: true, reason: 'offline' }
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return { skipped: true, reason: 'signed-out' }
  }

  return { skipped: false, userId }
}

export function createLearningSourceSyncActions(deps: LearningSourceSyncDeps): {
  uploadThisDeviceAsSource: () => Promise<UploadThisDeviceResult>
  downloadCloudToThisDevice: () => Promise<DownloadCloudResult>
} {
  return {
    async uploadThisDeviceAsSource() {
      const ready = await getReadyUserId(deps.getCurrentUserId, deps.isOnline)
      if (ready.skipped) return ready

      const result = await deps.replaceRemoteLearningDataWithLocal(ready.userId)
      deps.markSnapshotUploaded(ready.userId)
      return { skipped: false, ...result }
    },

    async downloadCloudToThisDevice() {
      const ready = await getReadyUserId(deps.getCurrentUserId, deps.isOnline)
      if (ready.skipped) return ready

      const result = await deps.replaceLocalDataWithRemote(ready.userId)
      await deps.refreshModuleStats()
      return { skipped: false, ...result }
    },
  }
}

function browserIsOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

async function refreshAllModuleStats(): Promise<void> {
  await syncModuleStats()
}

async function uploadLocalSnapshotWhenDue(userId: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    const key = `learningSnapshotUploadedAt:${userId}`
    const lastUploadedAt = Number(localStorage.getItem(key) ?? 0)
    if (Number.isFinite(lastUploadedAt) && Date.now() - lastUploadedAt < SNAPSHOT_UPLOAD_INTERVAL_MS) {
      return
    }

    await fullUpload(userId)
    localStorage.setItem(key, String(Date.now()))
    return
  }

  await fullUpload(userId)
}

function markSnapshotUploaded(userId: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(`learningSnapshotUploadedAt:${userId}`, String(Date.now()))
}

export const syncLearningForCurrentUser = createLearningSyncRunner({
  getCurrentUserId,
  isOnline: browserIsOnline,
  mergeRemoteDataToLocal,
  refreshModuleStats: refreshAllModuleStats,
  processReviewOutbox: processReviewOutboxForCurrentUser,
  uploadLocalSnapshot: uploadLocalSnapshotWhenDue,
})

const sourceSyncActions = createLearningSourceSyncActions({
  getCurrentUserId,
  isOnline: browserIsOnline,
  replaceRemoteLearningDataWithLocal,
  replaceLocalDataWithRemote,
  refreshModuleStats: refreshAllModuleStats,
  markSnapshotUploaded,
})

export const uploadThisDeviceAsLearningSource = sourceSyncActions.uploadThisDeviceAsSource
export const downloadCloudLearningToThisDevice = sourceSyncActions.downloadCloudToThisDevice
