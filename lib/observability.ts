import { ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { evidenceVersion, type Evidence } from './calculation-evidence'
import type { ModelReview } from './priscilla/model-contract'

export type DecisionTrace = {
  id: string; startedAt: string; mode: 'grounded-rules' | 'model-assisted' | 'rules-fallback'; runtime: 'server' | 'browser'; version: string; model?: ModelReview;
  storage: 'session' | 'saved' | 'unavailable'; evidence?: Evidence;
  spans: { id: string; parentId?: string; name: string; startedAt: string; durationMs: number; status: string; attributes: Attributes; events: { name: string; at: string; attributes?: Attributes }[] }[];
  logs: { at: string; spanId?: string; traceId?: string; severity: string; body: string; attributes: Record<string, unknown> }[];
}
const iso = (time: [number, number]) => new Date(time[0] * 1000 + time[1] / 1e6).toISOString()
const ms = (time: [number, number]) => time[0] * 1000 + time[1] / 1e6

// One SDK per operation; explicit parent context prevents cross-request leakage in Workers.
// No global provider, external exporter, prompt logging or authentication-header capture.
export function startDecisionTrace(operation: string, runtime: 'server' | 'browser') {
  const resource = resourceFromAttributes({ 'service.name': 'groundwork', 'service.version': evidenceVersion, 'groundwork.runtime': runtime })
  const exporter = new InMemorySpanExporter(), logExporter = new InMemoryLogRecordExporter()
  const provider = new BasicTracerProvider({ resource, spanProcessors: [new SimpleSpanProcessor(exporter)] })
  const loggerProvider = new LoggerProvider({ resource, processors: [new SimpleLogRecordProcessor({ exporter: logExporter })] })
  const tracer = provider.getTracer('groundwork.decisions', evidenceVersion), logger = loggerProvider.getLogger('groundwork.decisions', evidenceVersion)
  const root = tracer.startSpan(operation, { attributes: { 'groundwork.mode': 'grounded-rules', 'groundwork.llm.connected': false } }, ROOT_CONTEXT)
  const startedAt = new Date().toISOString()
  let model: ModelReview | undefined, finished: Promise<DecisionTrace> | undefined
  function log(span: Span, body: string, failed = false, attributes: Attributes = {}) {
    logger.emit({ context: trace.setSpan(ROOT_CONTEXT, span), severityNumber: failed ? SeverityNumber.ERROR : SeverityNumber.INFO, severityText: failed ? 'ERROR' : 'INFO', body, attributes })
  }
  function child(name: string, attributes: Attributes = {}) { return tracer.startSpan(name, { attributes }, trace.setSpan(ROOT_CONTEXT, root)) }
  function complete(span: Span, failed = false) {
    span.setStatus({ code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK })
    // Generic messages only: never record exception text, user prompts or raw client notes.
    log(span, failed ? 'Operation failed' : 'Operation completed', failed)
    span.end()
  }
  return {
    id: root.spanContext().traceId,
    run<T>(name: string, fn: () => T, attributes: Attributes = {}): T {
      const span = child(name, attributes)
      try { const value = fn(); complete(span); return value } catch (error) { complete(span, true); throw error }
    },
    async runAsync<T>(name: string, fn: () => Promise<T>, attributes: Attributes = {}): Promise<T> {
      const span = child(name, attributes)
      try { const value = await fn(); complete(span); return value } catch (error) { complete(span, true); throw error }
    },
    async modelCall<T>(name: string, fn: (span: Span) => Promise<T>, attributes: Attributes): Promise<T> {
      const span = tracer.startSpan(name, { kind: SpanKind.CLIENT, attributes }, trace.setSpan(ROOT_CONTEXT, root))
      try { const value = await fn(span); complete(span); return value } catch (error) { complete(span, true); throw error }
    },
    setModel(review: ModelReview) {
      model = review
      root.setAttributes({ 'groundwork.mode': review.status === 'accepted' ? 'model-assisted' : review.attempted ? 'rules-fallback' : 'grounded-rules', 'groundwork.llm.called': review.attempted, 'groundwork.llm.connected': review.received, 'groundwork.llm.outcome': review.status })
    },
    event(name: string, attributes: Attributes = {}) { root.addEvent(name, attributes); log(root, name, false, attributes) },
    finish(evidence?: Evidence, failed = false): Promise<DecisionTrace> {
      if (finished) return finished
      finished = (async () => {
      complete(root, failed)
      await Promise.all([provider.forceFlush(), loggerProvider.forceFlush()])
      const record: DecisionTrace = { id: root.spanContext().traceId, startedAt, mode: model?.status === 'accepted' ? 'model-assisted' : model?.attempted ? 'rules-fallback' : 'grounded-rules', model, runtime, version: evidenceVersion, storage: 'session', evidence,
        spans: exporter.getFinishedSpans().map(s => ({ id: s.spanContext().spanId, parentId: s.parentSpanContext?.spanId, name: s.name, startedAt: iso(s.startTime), durationMs: ms(s.duration), status: s.status.code === SpanStatusCode.ERROR ? 'error' : 'ok', attributes: s.attributes, events: s.events.map(e => ({ name: e.name, at: iso(e.time), attributes: e.attributes })) })),
        logs: logExporter.getFinishedLogRecords().map(l => ({ at: iso(l.hrTime), spanId: l.spanContext?.spanId, traceId: l.spanContext?.traceId, severity: l.severityText || 'INFO', body: String(l.body), attributes: l.attributes })),
      }
      await Promise.all([provider.shutdown(), loggerProvider.shutdown()])
      return record
      })()
      return finished
    },
  }
}

export async function traceEvidence(derive: () => Evidence) {
  const operation = startDecisionTrace('workbench.explain_calculation', 'browser')
  try {
    const evidence = operation.run('calculation.read_and_evaluate', derive)
    operation.run('evidence.check_results', () => {
      const failures = evidence.checks.filter(c => c.status === 'fail')
      operation.event('evidence.checks_recorded', { 'groundwork.checks.failed': failures.length, 'groundwork.source_date': evidence.sourceDate })
    })
    return await operation.finish(evidence)
  } catch { return await operation.finish(undefined, true) }
}
