# Groundwork

Groundwork helps wealth relationship managers act before clients ask. It connects client goals, account holdings, cash needs and meeting notes in one workspace, then shows risks, portfolio options and the evidence behind each action.

## Key features

- A daily action dashboard and client navigation for the full 20-client book.
- An explainable portfolio recommendation system: goal-fit components, account mandate checks, funding limits and client constraints are shown separately. Blocked options remain blocked.
- A combined view of included accounts, debt, liquid and illiquid assets, with clearly labelled external-account examples.
- Six stress scenarios with account contributions, collateral effects, funding gaps and decision comparisons.
- Priscilla: a dock, proactive notices, chat, direct client links, inline briefings and an Intelligence Scan.
- Collapsible client sections, RM feedback and a browser-local decision ledger.

## Data and model limits

Using supplied synthetic data dated **26 August 2026**: **20 clients, 24 accounts and 206 positions**. Source files are in `data/wealth-source/`; the checked application snapshot is `lib/wealth-snapshot.json`.

Financial calculations and base action ranking use deterministic code. The optional OpenAI adapter selects from bounded, pre-calculated evidence for eligible replies. It does not supply the financial figures. Failed validation falls back to the verified rule response. A configured key is not proof that a call succeeded; inspect that reply's trace.

The app has no live market feed, trade execution or automatic client messaging. External wealth examples, stress shocks and draft goals are assumptions. Goal-fit scores are not return forecasts or suitability probabilities. Complete tax calculations and fund look-through are not implemented.

## Stack

React and TypeScript, Vinext/Vite, Cloudflare Workers, D1 with Drizzle migrations, Recharts

## Local setup

Use Node.js **22.13.0 or later** and Linux or WSL with Bash, `flock`, `curl` and GNU `timeout`. The supplied build helpers are not native macOS scripts.

```sh
npm ci
cp .env.example .env
npm run build
```

Priscilla needs the local D1 schema. For a **fresh local database**, apply the supplied SQL files in order using the generated Worker configuration:

```sh
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0000_skinny_colossus.sql
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0001_numerous_lake.sql
npm run dev
```

Use the URL printed by the development server. Do not reapply these raw SQL files to an existing database. The `DB` binding stores RM feedback, scan state and trace records. The production hosting service manages the real binding and migrations. The local placeholder database ID is not a production database.

Development uses a local fixture RM identity. Production requires a trusted authenticated identity supplied by the hosting platform. Moving to another host requires real authentication and validation of that identity; do not trust client-supplied identity headers.

Ask Priscilla to explain Ravi's annual loan interest, then open **Fact check → Trace & logs** to inspect the actual call outcome and evidence checks. OpenTelemetry records execution; it does not establish source accuracy or investment suitability. No external telemetry collector is configured.

## Verification and data rebuild

```sh
npm test
```

This builds the app and runs the existing test suite. For the focused model and evidence checks:

```sh
node --test tests/live-model.test.mjs tests/evidence.test.mjs
```

The importer validates source joins and account totals, then prints the snapshot JSON:

```sh
node scripts/import-wealth.mjs > lib/wealth-snapshot.json
```

## Project map

| Path | Purpose |
| --- | --- |
| `app/`, `components/` | Dashboard, client views and interface |
| `lib/wealth-model.ts`, `lib/recommendations.ts` | Wealth calculations and portfolio recommendation logic |
| `lib/priscilla/` | Action ranking, chat, evidence selection and storage |
| `lib/observability.ts` | Trace and log instrumentation |
| `worker/` | Server request handling |
| `db/`, `drizzle/` | Database schema and migration history |
| `data/wealth-source/` | Supplied synthetic source records |
| `public/` | Application assets |
| `tests/` | Calculation, API and regression checks |
| `.openai/hosting.json` | Existing Sites project and logical bindings |

The hosting project ID links this checkout to the existing application. Preserve it when maintaining that site. A separate deployment needs its own hosting configuration.

## Implementation guides

- [Whole-client wealth and scenarios](docs/whole-wealth.md)
- [Portfolio recommendations](docs/recommendations.md)
- [Priscilla and client navigation](docs/priscilla.md)
- [Calculation evidence and tracing](docs/evidence-and-tracing.md)
- [RM review and safeguards](docs/rm-review.md)
