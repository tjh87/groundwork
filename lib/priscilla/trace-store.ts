import type { DecisionTrace } from '../observability'
import type { PriscillaDB } from './store'

export async function saveTrace(db: PriscillaDB | undefined, userId: string, record: DecisionTrace): Promise<DecisionTrace> {
  if (!db) return { ...record, storage: 'unavailable' }
  const saved: DecisionTrace = { ...record, storage: 'saved' }
  try {
    await db.prepare('INSERT INTO groundwork_traces (trace_id, user_id, created_at, record) VALUES (?, ?, ?, ?)').bind(record.id, userId, record.startedAt, JSON.stringify(saved)).run()
    // Retention is enforced on reads and pruned on the next write for this RM.
    await db.prepare('DELETE FROM groundwork_traces WHERE user_id = ? AND (created_at < ? OR trace_id NOT IN (SELECT trace_id FROM groundwork_traces WHERE user_id = ? ORDER BY created_at DESC, trace_id DESC LIMIT 100))').bind(userId, new Date(Date.now() - 7 * 86400000).toISOString(), userId).run()
    return saved
  } catch { return { ...record, storage: 'unavailable' } }
}

export async function readTrace(db: PriscillaDB | undefined, userId: string, id: string): Promise<DecisionTrace | null> {
  if (!db) return null
  const row = await db.prepare('SELECT record FROM groundwork_traces WHERE user_id = ? AND trace_id = ? AND created_at >= ?').bind(userId, id, new Date(Date.now() - 7 * 86400000).toISOString()).first<{ record: string }>()
  return row ? JSON.parse(row.record) : null
}
