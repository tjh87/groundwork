import type { Feedback, FeedbackAction } from './engine'

export interface Statement {
  bind(...values: unknown[]): Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface PriscillaDB { prepare(sql: string): Statement }
export type ScanRow = { user_id: string; job_id: string; status: 'running' | 'complete' | 'failed'; updated_at: string; result: string | null }

export function priscillaStore(db: PriscillaDB | undefined, userId: string) {
  if (!db) throw new Error('Priscilla storage is unavailable')
  return {
    async feedback() { return (await db.prepare('SELECT recommendation_id, kind, action FROM jeffrey_feedback WHERE user_id = ?').bind(userId).all<Feedback>()).results },
    async saveFeedback(id: string, kind: string, action: FeedbackAction) {
      await db.prepare('INSERT INTO jeffrey_feedback (user_id, recommendation_id, kind, action, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, recommendation_id) DO UPDATE SET kind = excluded.kind, action = excluded.action, updated_at = excluded.updated_at').bind(userId, id, kind, action, new Date().toISOString()).run()
    },
    async scan() { return db.prepare('SELECT * FROM jeffrey_scans WHERE user_id = ?').bind(userId).first<ScanRow>() },
    async startScan(id: string) {
      const now = new Date().toISOString(), stale = new Date(Date.now() - 120000).toISOString()
      await db.prepare("INSERT INTO jeffrey_scans (user_id, job_id, status, updated_at, result) VALUES (?, ?, 'running', ?, NULL) ON CONFLICT(user_id) DO UPDATE SET job_id = excluded.job_id, status = 'running', updated_at = excluded.updated_at, result = NULL WHERE jeffrey_scans.status <> 'running' OR jeffrey_scans.updated_at < ?").bind(userId, id, now, stale).run()
      return this.scan()
    },
    async finishScan(id: string, status: 'complete' | 'failed', result: unknown) {
      await db.prepare('UPDATE jeffrey_scans SET status = ?, updated_at = ?, result = ? WHERE user_id = ? AND job_id = ?').bind(status, new Date().toISOString(), JSON.stringify(result), userId, id).run()
    }
  }
}
