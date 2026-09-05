# Whole-wealth simulation

## Purpose

Help an RM test the client's combined wealth without losing the purpose, mandate or collateral boundary of each account. This is a rule-driven hackathon simulation, not a live bank connection or autonomous financial adviser.

## Source and reconciliation

- Original synthetic inputs: `data/wealth-source/` from the supplied hackathon ZIP.
- Current snapshot: 26 August 2026; 20 clients, 24 accounts and 206 positions.
- `scripts/import-wealth.mjs` prints the compact, checked dataset on stdout. Its output is checked in as `lib/wealth-snapshot.json`.
- The importer checks IDs, joins, account/client AUM and lending values. Older snapshots are not aggregated into current assets.
- Monetary comparisons use source USD FX rates. Cost-basis gaps remain null.
- ALTS target weights sum to 93%. Its limits remain valid source rules, but it is excluded from complete policy benchmark choices. No missing 7% is invented.
- Corrected Ravi's note provenance to 11 June 2026 and Cheung's to 16 July 2026 in the retained brief.

## Interface

Each of the 20 client briefs now starts with a goal-matched Recommendations view, documented in `docs/recommendations.md`, and keeps these four views:

1. Accounts & liquidity: account roles, individual mandate tests, gross assets, debt, net assets, liquidity buckets and dated client needs. Household policy weights are a planning comparison, not a signed mandate.
2. Goals & values: source objectives and actual RM notes; draft spending, yield, return and loss limits; transparent income assumptions; explicit client-stated exclusions. Missing ethical/religious screening is not labelled compliant.
3. Stress & decisions: six common shocks, per-account changes, gains/losses/net result, a policy proxy, collateral gaps, funding-delay test and a same-account cash-rebalance comparison.
4. Evidence & gaps: known versus assumed fields, stale valuations, missing data, model boundaries and grouped direct holdings.

The old fixed RM brief and preset scenarios remain in an expandable section. They do not change with the new simulation controls. The morning view links to the new workspace and shows account counts. Primary-risk distribution now counts the actual client labels rather than an invented signal total.

## External accounts

The default is unknown, not zero. The RM can add up to eight distinct hypothetical accounts with an editable name, asset amount, debt, cash/debt currency and one of three stated mixes. Existing source account identifiers cannot be reused. Instruments retain their source currencies; only the cash sleeve and entered debt use the chosen currency. This is not a complete statement-entry tool.

External asset values and debt are USD amounts. External debt assumes 6% interest; a debt-bearing example is conservatively treated as encumbered. No external margin trigger, transfer authority or lending value is invented. An account can be removed and re-entered to change its assumptions.

## Core calculations

- Gross assets = sum of unique included account–instrument values.
- Net assets in model = gross assets − included debt. It is not a claim about total net worth.
- Shared stress = sum of each holding value × explicit shock; account gains/losses are net account contributions, not underlying gross winners/losers.
- Source facility LTV = debt / after-haircut lending value. Repayment gap = max(0, debt − trigger × stressed lending value).
- Draw capacity is capped by both the facility limit and source LTV trigger. Gains outside the collateral account do not cure its margin gap.
- FX scenario: non-home asset and debt values change by 1 / 1.10 − 1 in home-currency terms, displayed using initial USD equivalents.
- Six-month delay does not create sale proceeds or a new loan. Funding need = entered spending budget + six months of modelled loan interest. The USD gap counts only unpledged daily USD cash; other currencies need a separate conversion. Missing spending is unknown, not zero, and invalid inputs block saving. This is separate from market-price loss.
- Yield assumptions are cash-distribution ranges, not total-return forecasts: cash 2–4%, bonds 3–5%, equity 1–3%, other asset classes excluded until payment schedules are known. A slider scales these hypothetical inputs. Deduct loan interest; tax, fees and lender withholding still need confirmation.
- Annual need defaults only from rows labelled Annual; future start dates remain visible. Instalment, irregular and one-off needs are not annualised. Commitment detail is not added again to matching cash needs.
- Rebalance moves 0–20% of eligible daily, unpledged equity to cash in the same account and currency. Excludes custody, collateral and hypothetical external accounts; retests account bands. Both this tool and RecSys share Ravi’s no-listed-sales rule and Cheung’s protection for loss or unknown-cost positions. It does not execute transactions or claim tax savings.

## Persistence and limits

Draft controls and external examples are page-local. “Save simulation review” records inputs, results and follow-up questions in the existing browser-local decision ledger. It does not update a CRM, send a message, establish client consent or execute a trade. Reminders operate only on the current device, with a local flag if browser notifications fail. Notification text omits client names and balances. Local records are validated and are not an immutable audit log; unreadable records are preserved rather than overwritten.

No current market feed, total-return history, probability model, complete issuer/fund look-through, precise derivative repricing, beneficial ownership record, tax calculation or religious screening service is supplied. Benchmarks are home-currency policy proxies, not actual Julius Baer composite performance.

## Verification

`node --test tests/wealth-model.test.mjs` checks reconciliation, duplicate guards, loan/FX math, account offsets, common-loss stress, mandate boundaries, income assumptions, client constraints and unknown ethical screening. These tests evaluate all six scenarios across all 20 clients. Use the normal Sites build workflow for the deployable app; browser testing is separate.
