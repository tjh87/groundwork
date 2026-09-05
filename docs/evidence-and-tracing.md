# Groundwork: calculation evidence and decision tracing

Fact check buttons are additive to the RM workbench. They show data inputs, source record IDs, formulas, rounding, assumptions, checks, decision reasons and limits. The app retains the existing colours, fonts, client controls and bottom-right Priscilla chat.

## Where to use it

- Goals & values: annual loan interest.
- Stress & decisions: combined asset change, position contributions, collateral LTV and repayment, six-month carry and funding gap, simulated cash-move decisions.
- Recommendations: the selected option’s goal-fit components and mandatory gates. Unfunded options stay unscored.
- Earlier RM brief, Ravi: current and shocked facility interest, delay carry and trust funding.
- Priscilla: each new reply and completed scan has an evidence bubble with its server trace.

### Ravi’s numbers

The supplied `credit_facilities.csv` record `CF-0001` has a 6.15% annual rate and USD 6,500,000 drawn at the 2026-08-26 snapshot. 5.15% is not the current source rate.

| Measure | Calculation | Result |
|---|---|---|
| Annual interest | 6,500,000 × 6.15 / 100 | USD 399,750 → USD 0.40m |
| Rate +100bp | 6.15 + 100 / 100 | 7.15% |
| Stressed annual interest | 6,500,000 × 7.15 / 100 | USD 464,750 → USD 0.46m |
| Extra annual cost | 464,750 − 399,750 | USD 65,000 → USD 0.07m |
| Six-month carry | 399,750 × 6 / 12 | USD 199,875 |
| Trust plus six-month carry | 2,000,000 + 199,875 | USD 2,199,875 → USD 2.20m |

The previous delay reserve said USD 2.40m while describing six months of carry. It now uses the six-month amount and does not imply that a bridge is already funded. Source trust need: `planned_cash_needs.csv`, `CN-003`, likely, not confirmed.

Simple interest holds principal and rates constant. Fees, compounding, tax, day-count conventions and new draws are excluded. Other-bank debt examples use an explicitly labelled assumed 6% rate. Scenario percentage denominators use included starting gross assets. Holding contributions reconcile to account totals and combined effects. Collateral uses the source’s debt / after-haircut lending-value convention.

## OpenTelemetry implementation

`lib/observability.ts` uses the actual OpenTelemetry JavaScript trace and log SDKs: `BasicTracerProvider`, `SimpleSpanProcessor`, `LoggerProvider` and `SimpleLogRecordProcessor`. SDK exporters collect completed spans and correlated logs. Groundwork serializes them into the private application’s trace record; this JSON is a Groundwork export, not an OTLP wire payload. No external collector is configured.

Each operation owns its providers and explicitly propagates its root span context. There is no shared active context between concurrent RM requests. Real operation times, trace IDs, span IDs, parent IDs, status, attributes and events are captured.

The server instruments snapshot reads, per-client rule evaluation, RM feedback reads, ranking, response preparation, source binding and client-reference validation. Completed scans use the same tracing pattern. Calculation bubbles in the workbench trace a fresh calculation replay when opened; the UI distinguishes this from the original server execution.

## Live model connection

The server adapter uses the OpenAI Responses API with `gpt-5.6-luna`, selected for a small, constrained evidence-selection task. Its documented structured-output support and `reasoning.effort: none` suit this task. The model receives the RM’s current question and bounded, dated source blocks from the already-calculated reply. It returns up to three evidence IDs. Groundwork renders the unchanged text and its bound source references. It never accepts model-written figures, financial claims, URLs, diagrams, source references or hidden reasoning.

**Connection status is deployment-specific.** Credentials are configured separately from this repository. Inspect each reply’s trace to verify whether a live provider call ran and its output passed validation. Automated tests use simulated provider responses; they do not establish live API availability or model quality.

To activate:

1. Add a project-scoped OpenAI API key as the secret production runtime variable `OPENAI_API_KEY` through Sites environment settings. Never put it in chat, source code, browser storage, a public-prefixed variable or the hosting manifest.
2. `OPENAI_MODEL=gpt-5.6-luna` is the configured model. Local development uses the same keys in ignored `.env`; the tracked `.env.example` contains no secret.
3. Redeploy a saved version to apply the environment revision. A configured key does not mean a call succeeded.
4. Ask Priscilla “Explain Ravi’s annual loan interest”. Open Fact check → Trace & logs. A successful connection must show a completed `chat gpt-5.6-luna` span, a separate passed evidence-selection validation, returned model/request IDs and any usage OpenAI reports. Missing usage is shown as “Not reported”.
5. Confirm Ravi’s source rate remains 6.15%, annual interest remains USD 399,750, source references remain attached and failed portfolio gates still block advice.

Coverage: model calls augment explicit calculation/scenario replies and ranked-action briefings. Ordinary navigation, clarifying questions, general knowledge replies, client summaries, the background Intelligence Scan, connection checks and workbench calculation replays stay deterministic. No API request runs automatically from a scan or timer. Each eligible user message makes at most one provider request, with an eight-second timeout, a 300-output-token cap, no automatic retry, a fixed HTTPS endpoint and `store: false`. This is a per-request bound, not a daily spend quota. Configure the provider project’s spend controls before using real credentials.

The model review is additive; the base answer, client links, ranking, source assumptions, risk checks and mandatory caveats are retained. Selection validation checks the strict response shape, known IDs, unique IDs and maximum selection size. It proves only that displayed passages match the allowed evidence. It does not independently validate source truth or prove that the model chose the most relevant passages. Unknown fields, new numbers, invented citations, provider refusal, malformed output, incomplete output and failures produce a disclosed rules fallback.

The actual awaited provider request is a child span with `gen_ai.provider.name`, `gen_ai.operation.name`, requested/returned models, reported token counts, safe request/response IDs, HTTP status and an SHA-256 digest of the evidence blocks. A separate span checks returned evidence IDs. Provider success and output rejection remain distinct. The selected canonical blocks and their source references are retained with the evidence record. An unconfigured provider has no model-request span. Logs do not contain the prompt, authorization header, raw response or exception text.

Only the current question and the bounded reply evidence are sent to OpenAI. Saved chat history, raw RM note files, authentication details and unsaved external-account drafts are not sent. Groundwork does not retain raw questions in its trace store. `store: false` disables Responses API application-state storage; it does not by itself guarantee zero provider retention. Use approved provider data controls before supplying real client data.

The model panel and Mermaid map show the actual call outcome. A transport failure does not display a validation step that never ran. Trace completion is idempotent, so a later storage error cannot create a second completion.

OpenTelemetry reports execution. An OK span does not prove financial truth, source freshness, client suitability or forecast accuracy. Business checks and evidence gaps remain a separate part of the bubble.

## Storage and access

- Authenticated chat and scan traces are stored in `groundwork_traces`, scoped by the platform-provided RM identity.
- `GET /api/agent/trace/:traceId` requires that identity and returns only its records within seven days.
- On each trace write, this RM’s records older than seven days and records outside the latest 100 are removed. Expired records are not readable while awaiting cleanup.
- Raw chat prompts, original RM note text, exception messages and authentication headers are not telemetry attributes or log bodies. The saved explanation does contain the client facts and decision evidence shown to that RM.
- Workbench calculation replays stay in page memory unless the RM downloads the record. They are not silently sent to the server.
- A storage failure leaves the reply available and explicitly marks the trace as unsaved. The RM can download the in-session copy.
- The generated migration adds a new table. Existing feedback, scan tables and applied migrations stay intact.

## Mermaid implementation

`components/evidence-diagram.tsx` loads the actual Mermaid library on demand. Controlled graph definitions show source and assumption inputs joining a calculation, branching into a result and checks requiring review, then reaching an RM decision. This is a documented evidence map, not a private reasoning transcript.

Mermaid runs with strict security and root-level `htmlLabels: false`. SVG is additionally sanitized with DOMPurify. There are no click directives, external diagram servers, raw user-authored Mermaid definitions or inline HTML labels. If rendering fails, the formulas and sources remain available. The RM can export Mermaid Markdown for Obsidian or the complete evidence and trace as JSON.

## Verification

Regression checks cover independently known interest values, basis-point conversion and rounding; all 20 clients under all six scenarios; external-example labelling; no-sale constraints; RecSys component sums and failed gates; real SDK parent/child spans and correlated logs; failure redaction; concurrent trace isolation; authenticated access; retention; and storage failure.

Earlier browser checks covered the interest bubble, SVG labels, changing scenarios, chat traces and existing client navigation. This additive model connection was checked through source-level API and failure tests; no new browser or live-provider verification is claimed. The synthetic snapshot remains dated 2026-08-26.

## Implementation references

- [OpenTelemetry JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [OpenTelemetry traces and span semantics](https://opentelemetry.io/docs/concepts/signals/traces/)
- [OpenTelemetry GenAI observability](https://opentelemetry.io/blog/2026/genai-observability/)
- [OpenTelemetry JavaScript repository](https://github.com/open-telemetry/opentelemetry-js)
- [Mermaid API usage](https://mermaid.js.org/config/usage.html)
- [Mermaid repository](https://github.com/mermaid-js/mermaid)

- [OpenAI GPT-5.6 Luna model](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
