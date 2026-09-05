import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const jeffreyFeedback = sqliteTable('jeffrey_feedback', {
  userId: text('user_id').notNull(),
  recommendationId: text('recommendation_id').notNull(),
  kind: text('kind').notNull(),
  action: text('action', { enum: ['accepted', 'dismissed'] }).notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.recommendationId] })])

export const jeffreyScans = sqliteTable('jeffrey_scans', {
  userId: text('user_id').primaryKey(),
  jobId: text('job_id').notNull(),
  status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
  updatedAt: text('updated_at').notNull(),
  result: text('result'),
})

export const groundworkTraces = sqliteTable('groundwork_traces', {
  traceId: text('trace_id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(),
  record: text('record').notNull(),
})
