import { supabase } from '@/lib/supabase'
import { normalizeFSRSState } from '@/lib/fsrsState'
import type { FSRSState, NotebookItem } from '@/types'

// ── Card State Sync ─────────────────────────────────────────

interface CardStateRow {
  card_id: string
  fsrs_main: FSRSState
  ai_unlocked: boolean
  updated_at: string
}

export async function syncCardState(
  userId: string,
  cardId: string,
  fsrsMain: FSRSState,
  aiUnlocked: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('card_states')
    .upsert({
      user_id: userId,
      card_id: cardId,
      fsrs_main: fsrsMain,
      ai_unlocked: aiUnlocked,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,card_id' })

  if (error) {
    console.warn('[sync] card_states upsert failed:', error.message)
  }
}

export async function batchSyncCardStates(
  userId: string,
  cards: Array<{ cardId: string; fsrsMain: FSRSState; aiUnlocked: boolean }>,
): Promise<void> {
  if (cards.length === 0) return

  const rows = cards.map(c => ({
    user_id: userId,
    card_id: c.cardId,
    fsrs_main: c.fsrsMain,
    ai_unlocked: c.aiUnlocked,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('card_states')
    .upsert(rows, { onConflict: 'user_id,card_id' })

  if (error) {
    console.warn('[sync] batch card_states upsert failed:', error.message)
  }
}

export async function pullCardStates(userId: string): Promise<CardStateRow[]> {
  const all: CardStateRow[] = []
  const pageSize = 1000
  let page = 0

  while (true) {
    const { data, error } = await supabase
      .from('card_states')
      .select('card_id, fsrs_main, ai_unlocked, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.warn('[sync] pullCardStates failed:', error.message)
      break
    }

    if (!data || data.length === 0) break
    all.push(...data as CardStateRow[])
    if (data.length < pageSize) break
    page++
  }

  return all
}

// ── Notebook Sync ───────────────────────────────────────────

interface NotebookItemRow {
  notebook_id: string
  type: string
  content: string
  example_sentence: string
  source_card_id: string
  source_tag: string
  fsrs_notebook: FSRSState
  created_at: number
  updated_at: string
}

export async function syncNotebookItem(
  userId: string,
  item: NotebookItem,
): Promise<void> {
  const { error } = await supabase
    .from('notebook_items_sync')
    .upsert({
      user_id: userId,
      notebook_id: item.notebookId,
      type: item.type,
      content: item.content,
      example_sentence: item.exampleSentence,
      source_card_id: item.sourceCardId,
      source_tag: item.sourceTag,
      fsrs_notebook: item.fsrsNotebook,
      created_at: item.createdAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,notebook_id' })

  if (error) {
    console.warn('[sync] notebook_items_sync upsert failed:', error.message)
  }
}

export async function deleteNotebookItemSync(
  userId: string,
  notebookId: string,
): Promise<void> {
  const { error } = await supabase
    .from('notebook_items_sync')
    .delete()
    .eq('user_id', userId)
    .eq('notebook_id', notebookId)

  if (error) {
    console.warn('[sync] notebook_items_sync delete failed:', error.message)
  }
}

export async function pullNotebookItems(userId: string): Promise<NotebookItemRow[]> {
  const all: NotebookItemRow[] = []
  const pageSize = 500
  let page = 0

  while (true) {
    const { data, error } = await supabase
      .from('notebook_items_sync')
      .select('notebook_id, type, content, example_sentence, source_card_id, source_tag, fsrs_notebook, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.warn('[sync] pullNotebookItems failed:', error.message)
      break
    }

    if (!data || data.length === 0) break
    all.push(...data as NotebookItemRow[])
    if (data.length < pageSize) break
    page++
  }

  return all
}

// ── Merge Down ──────────────────────────────────────────────

export async function mergeRemoteDataToLocal(userId: string): Promise<{
  cardsMerged: number
  notebooksMerged: number
}> {
  const { db } = await import('@/db/schema')

  // 1. Pull and merge card states
  const remoteCards = await pullCardStates(userId)
  let cardsMerged = 0

  if (remoteCards.length > 0) {
    const localCards = await db.cards.toArray()
    const localCardMap = new Map(localCards.map(c => [c.cardId, c]))

    for (const remote of remoteCards) {
      const local = localCardMap.get(remote.card_id)
      if (!local) continue

      const remoteTime = new Date(remote.updated_at).getTime()
      const localTime = local.fsrsMain.last_review
        ? new Date(local.fsrsMain.last_review).getTime()
        : 0

      // Remote wins if newer
      if (remoteTime > localTime) {
        await db.cards.update(remote.card_id, {
          fsrsMain: normalizeFSRSState(remote.fsrs_main),
          aiUnlocked: remote.ai_unlocked,
        })
        cardsMerged++
      }
    }
  }

  // 2. Pull and merge notebook items
  const remoteNotebooks = await pullNotebookItems(userId)
  let notebooksMerged = 0

  if (remoteNotebooks.length > 0) {
    const localNotebooks = await db.notebook.toArray()
    const localNotebookMap = new Map(localNotebooks.map(n => [n.notebookId, n]))

    for (const remote of remoteNotebooks) {
      const local = localNotebookMap.get(remote.notebook_id)
      if (local) {
        // Update existing
        await db.notebook.update(remote.notebook_id, {
          fsrsNotebook: normalizeFSRSState(remote.fsrs_notebook),
          content: remote.content,
          exampleSentence: remote.example_sentence,
        })
      } else {
        // Insert new
        await db.notebook.add({
          notebookId: remote.notebook_id,
          type: remote.type as NotebookItem['type'],
          content: remote.content,
          exampleSentence: remote.example_sentence,
          sourceCardId: remote.source_card_id,
          sourceTag: remote.source_tag,
          fsrsNotebook: normalizeFSRSState(remote.fsrs_notebook),
          createdAt: remote.created_at,
        })
      }
      notebooksMerged++
    }
  }

  return { cardsMerged, notebooksMerged }
}

export async function clearRemoteLearningData(userId: string): Promise<void> {
  const [cardStatesResult, notebookResult] = await Promise.all([
    supabase.from('card_states').delete().eq('user_id', userId),
    supabase.from('notebook_items_sync').delete().eq('user_id', userId),
  ])

  const error = cardStatesResult.error ?? notebookResult.error
  if (error) {
    throw new Error(`云端学习数据清除失败：${error.message}`)
  }
}

// ── Full Upload (for initial backup / catch-up) ─────────────

export async function fullUpload(userId: string): Promise<void> {
  const { db } = await import('@/db/schema')

  // Upload all studied card states
  const studiedCards = await db.cards
    .filter(c => c.fsrsMain.reps > 0 || (c.aiUnlocked ?? false))
    .toArray()

  if (studiedCards.length > 0) {
    await batchSyncCardStates(
      userId,
      studiedCards.map(c => ({
        cardId: c.cardId,
        fsrsMain: c.fsrsMain,
        aiUnlocked: c.aiUnlocked ?? false,
      })),
    )
  }

  // Upload all notebook items
  const notebookItems = await db.notebook.toArray()
  for (const item of notebookItems) {
    await syncNotebookItem(userId, item)
  }
}
