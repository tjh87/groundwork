# RM workflow review · 5 September 2026

Reviewed the existing app as an RM preparing client conversations. Source data remains the synthetic 26 August 2026 snapshot.

## Issues fixed

- A negative reserve was silently converted to zero and could clear blocked recommendations. Invalid numbers now stop scores, rankings, proposed effects and saving. The engine also rejects invalid requests, independently of the UI.
- The stress cash-move tool sold Cheung's loss positions and could alter hypothetical outside-bank assets. It now shares RecSys sale eligibility, including Ravi's no-listed-sales rule, Cheung's loss/unknown-cost protection, and fixed custody/collateral/external accounts.
- Cash moves assumed conversion to USD. They now preserve each account and each currency. The exact selected RecSys portfolio remains distinct from this generic cash illustration.
- The six-month USD funding test counted all cash currencies and treated unknown spending as zero. It now requires an explicit valid budget, counts only USD cash, displays other-currency cash separately, and shows unknown gaps as unavailable.
- A zero price-loss funding scenario displayed duplicate minus signs and could appear to pass a market-loss test. Zero is now formatted correctly; the funding test explicitly makes no market-price claim.
- Cheung’s older Why explanation used a three-year reserve and treated all cash as USD. It now labels the reserve as a separate case assumption and shows the USD-only cash gap. Every Why panel identifies its fixed snapshot basis.
- The dashboard described a historical case as today's live monitoring. Snapshot dates, case timing, supplied events and local-only actions are now explicit. Completing a task does not clear its underlying client risk.
- Malformed or inaccessible browser storage could crash the dashboard or silently replace records. Reads are validated, writes fail visibly, unreadable records are preserved, and counts refresh across tabs.
- Notification exceptions could fail silently. Reminders now have a visible local fallback, show the actual delivery mode, and omit client identities and balances from operating-system notifications.
- A draft note could carry into another Why panel. Notes reset by client/insight context. Recommendation notes reset when the selected option changes; saved-result messages clear when inputs change.
- Inherited object-property slugs could cause a client page error. Unknown and inherited-property routes now return 404; client route state is keyed by client ID.

## Verification

- 45 automated numerical and failure-handling checks passed. They cover all 20 clients and six stress presets, invalid inputs, account and currency conservation, no-sale constraints, missing budgets, corrupt storage, write failures and notification fallback/privacy.
- All 20 client routes opened in the browser with the correct client heading and five workbench tabs.
- Checked negative-reserve rejection and recovery, Cheung's stress cash move and USD funding, client search with no results, task completion/reopening and separate client notes.
- Production build passed. Unknown client, `toString` and `__proto__` routes returned 404 in the built Worker.
- Project-wide TypeScript still reports the three existing Cloudflare ambient-type errors in `db/index.ts` and `worker/index.ts`. No new app/model type errors were reported.

## Limits before a bank pilot

This is a simulated RM decision tool. It has no live price/news feed, external bank link, shared CRM, remote push service, immutable audit store or trade execution. Local records can be lost if browser data is cleared. Stress assumptions and goal-fit scores are not validated predictions, investment suitability approval or promised returns. Real advisory use requires verified client data and bank review.
