# Groundwork · Priscilla RM intelligence

Implemented from the supplied assistant feature brief (the original attachment is not part of this repository). The existing client book, wealth tools, portfolio RecSys, scenarios, RM action list and decision ledger remain in place. Priscilla adds a separate next-action queue; her priority points never alter portfolio suitability gates or goal-fit scores.

## Five surfaces

- **Dock:** fixed 60 px icon, 28 px from the bottom and right. Badge counts visible `call` and `action` items. Ctrl+Space toggles chat; Esc closes it. A connection dot is amber while connecting and red on failure.
- **Toast:** one note, only on a client opening or a completed scan. It lasts 9 seconds, never tracks the mouse, never opens chat automatically, and is suppressed while chat is open. A replacement clears the old timer. Clicking starts a conversation with that note as Priscilla’s first message.
- **Chat:** fixed at the bottom right, 28 px from the right and 104 px above the bottom so the dock stays visible; uses a dedicated accessible portal with no inherited centring styles, source-backed answers, scenario figures, typing and error states. POST transport is retained. Eligible calculation and ranked-action replies can add model-selected evidence through the OpenAI server adapter. Live use requires a server API key; absent or failed calls are clearly labelled. See `evidence-and-tracing.md`.
- **Inline intelligence:** a five-sentence briefing on all 20 client pages and a ranked “Today’s Briefing” rail on the dashboard.
- **Intelligence Scan:** recomputes actions for all 20 clients in a background task, reports actual counts, and refreshes the queue. Concurrent requests by the same RM reuse an active job. Stale jobs can be replaced after two minutes.

Priscilla’s styles are scoped to her components: navy `#122b4e`, deep navy `#0b1f3a`, warm grey `#f7f5f1`, border `#e6e2da`, gold `#b08d3e`, Georgia headings. The existing app theme is unchanged. Chat uses a nonmodal accessible dialog, reduced-motion support and a narrow-screen layout.

## Recommendations and evidence

Rules cover collateral, account mandates, draft goal-currency reserves, whole-model concentration, stress exposure, income gaps, supplied event links and missing data. Every action includes a rationale and source chips. Peer groups use the **exact supplied life stage and risk profile** in `clients.csv`; counts exclude the client. No peer investment outcome or adoption history is invented.

Base urgency points are visible. Accepting saves the RM’s preference and adds 15 points once to the same issue category; multiple accepts do not stack. Dismissal removes an item and re-ranks the queue. Acceptance means “for review,” so it does not remove a `call`/`action` from the badge or resolve a risk. Feedback is scoped to the signed-in RM and current snapshot IDs, stored in D1, and survives reloads and later visits.

The model uses the synthetic 26 Aug 2026 snapshot. Draft workbench goals and external account examples are not chat inputs. YTD returns, observed drawdown and client-agreed percentage loss/yield targets are unavailable. The app states these gaps. Stress shocks, the 15% draft loss control, 25% whole-model concentration flag, collateral review buffer and two-year reserve test are labelled assumptions, not signed client instructions. Supplied events are dated case material, not live or upcoming news. Ravi’s no-sale restriction remains explicit.

## Contract and storage

| Route | Purpose |
|---|---|
| `GET /recommendations` | Ranked items, provenance, peer notes, saved feedback and summary |
| `POST /recommendations/{id}/feedback` | Validate and save `accepted` or `dismissed` |
| `GET /clients/{id}/insight` | Five-sentence source-backed client briefing |
| `GET /api/agent` | `agent_welcome`, connection check, mode and source date |
| `POST /api/agent` | `chat`, `ping` → `pong`, or `scan` → `scan_started` |
| `GET /api/agent/scan/{job_id}` | `scan_running` or `scan_results` with message and summary |

Hosted requests require the platform-provided authenticated user ID. Every persisted query is parameterised and scoped to it. Cross-origin writes, invalid feedback IDs, unsupported actions and oversized messages are rejected. Errors do not disable the existing workbench. Generated Drizzle migrations own the schema; runtime code never creates or alters tables.

Local HTTP preview uses a compile-time development fixture identity; the production Worker passes `false` for that option. Test records stay local and are not migration seeds. No extra app sign-in system, live prices, client messaging or trade execution has been added.

## Verification

- Nine focused tests cover all 20 client briefings and navigation targets, source-based peers, score boosts, dismissal, chat context and numerical reconciliation, SQL persistence and user isolation, asynchronous scans, validation and failure cases.
- The 45 existing wealth, portfolio recommendation and RM failure tests passed unchanged.
- Browser checks: all 20 inline briefings render; toast appears in under one second and expires after nine seconds; chat stays closed until requested; Ctrl+Space and Esc work; client/scan toast notes carry into chat and “yes” keeps the correct scope; scan during chat produces no toast; badge changes from 26 to 25 after a test dismissal; acceptance persists on reload and re-ranks the queue.
- Production build passes. Hosted code keeps the development identity disabled.
- Preview limitation: this starter’s existing client router uses secure-context Web Crypto, unavailable on the HTTP preview origin; it falls back to page navigation and logs a framework error. Direct page loads and the Priscilla flows were checked separately without new application errors. The published site uses HTTPS. Existing global Cloudflare type declaration errors remain outside this additive change.

## Display-name update

The app is Groundwork and the assistant is Priscilla across headers, page metadata, inline briefings, chat, loading/error states, notifications and exported review files. Legacy database table names, recommendation IDs and browser storage keys remain stable to preserve existing feedback and reviews. Applied migrations are unchanged.

## Client links and section controls

Priscilla replies now include **Open [client name]** links below ranked actions, client briefings and scenario results. Intelligence Scan results carry links to the top queue items. Links follow the saved feedback ranking, deduplicate clients, and resolve known IDs through the app's client directory. No URL is taken from chat text. All 20 clients are supported. Try “Who needs attention?”, “Recommended actions for Cheung”, or “Open Ravi”. Unknown names prompt for a client; multiple named clients offer separate links. Clicking a link closes chat and opens the client file. A same-client link preserves the current page's draft inputs.

Each client page now has a **Page sections** sidebar with jump and minimise controls for next actions, wealth summary, recommendations, accounts and liquidity, goals and values, stress and decisions, evidence and gaps, and the earlier RM brief. **Focus on next actions** minimises the other sections. **Expand all** and **Minimise all** change the section states; the existing workbench tabs still show one view at a time. On smaller screens, the sidebar becomes an **Options** control above the content.

Minimised sections stay mounted. Scenario settings, entered goals and recommendation inputs remain intact while the RM uses that client page. Only the section visibility preference is saved in browser storage, separately for each client. Draft financial inputs are not newly persisted across reloads or client changes. Controls wait for saved visibility preferences to load before accepting changes. Section jumps expand the destination, select the correct tab, and focus its heading. Portfolio calculations, suitability gates, action feedback and the decision ledger are unchanged.

Browser checks confirmed ranked links, Ravi and Cheung navigation, same-client draft retention, scan links, hidden goal inputs, preserved stress results and recommendation drafts after minimise/expand, focus mode, isolated client view preferences, and restored-view navigation. The desktop page has no horizontal overflow.
