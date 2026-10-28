# IdleMinerBot — Agent Notes

Discord idle-miner bot (JavaScript, ESM, no TypeScript). ~9.5k LOC.

## Commands
- Install: `npm install`
- Full check: `npm test` (unit tests via `node --test` + `tools/sanity-check.mjs`)
- Unit only: `npm run test:unit`
- Sanity only: `node tools/sanity-check.mjs`
- Per-file syntax: `node --check <file>`

## Architecture
- `index.js` — client bootstrap, event handlers, cron jobs, manager-work accrual.
- `dataManager.js` — Supabase persistence. Users live in the `users` table as
  `{ id, data, version }` envelopes. Writes go through `mutateRow`, a
  version-guarded compare-and-swap with retries.
- `commands/shared/*.js` — shared command logic used by prefix + slash adapters.
- `commands/interactions/*.js` — static custom-ID handlers (exact/pattern).
- `utils/` — economy math, boosters, persistence helpers, formatting.
- `config/*.json` — game data (mine factors, difficulty, regions, manager costs)
  plus `patchnotes.json`, which backs the `info` command. Add a new entry at the
  top of the array for each release (newest first), each shaped
  `{ version, date, changes: [...] }`. The command mirrors VivacityAPI's browser:
  a version select menu plus First/Newer/Older/Last buttons, with long change
  lists chunked into `What's Changed` fields.

## Conventions and invariants
- Money mutations must use `utils/economyConstants.js` helpers
  (`moneyAdd`/`moneySub`/`toMoney`). Spending/affordability gates must use
  `moneyCovers(available, cost)` — a strict `>=` — never the relative-tolerant
  `moneyGte`/`moneyLt`, which are for display and de-duplication only. A tolerant
  gate at 1e170-scale accepts a wallet that is short and the debit drives the
  balance negative, making every later purchase free.
- Per-tick manager automation work must be bounded. Use
  `utils/automationCycles.js` (`resolveAutomationCycles`, `clampIdleAccrualSeconds`)
  so a stale timestamp or long idle window cannot drive millions of loop
  iterations or mint an unbounded idle windfall in one tick.
- Premium entitlement is granted only from the server-side checkout record
  (`createCheckoutSessionRecord` / `claimCheckoutFulfilment`), never from
  client-supplied `client_reference_id`/metadata. Fulfilment is idempotent.
- `hello`/`info` are throttled by `cooldownManager.js`; `enforceCommandCooldown`
  runs before both message and interaction dispatch.
- Booster parsing/activation goes through `utils/boosts.js`
  (`normalizeBooster`, `getActiveBoostMultiplier`, `getActiveInstantCashSeconds`).
- Upgrade purchases go through `utils/upgradeEngine.js` (`planUpgrade`) and
  `utils/purchaseAmount.js` (`parsePurchaseAmount`, `resolvePurchaseCount`).
- `deriveUserPatch(baseline, candidate)` returns changed fields only. Snapshot
  updates pass a `getUser()` document; partial updates are diffed against the
  live row inside the transaction so unrelated fields are never clobbered.
- Full-table scans must stream: use `forEachUserPage` / `forEachUser` in
  `dataManager.js`, never a bare `.select('*')` over `users`.
- Component custom IDs must not embed user IDs; mint one with
  `interactionSessions.createComponentToken(ownerId)` and verify ownership with
  `isComponentTokenOwner(interaction, token)` (fail closed: unknown/expired token
  or process restart denies). Standalone dynamic (RegExp) interaction handlers
  must declare `tokenPrefixes`, and `isComponentOwner(interaction, ownerId)` is
  the collector-handler equivalent.
- Activity marking (`markUserActive`) is throttled and best-effort; it must
  never block a command response.
- `getMineFactor(mine)` reads `prestige_count` from the mine object; passing a
  bare mine name ignores prestige.

## Testing
- Tests are `.mjs` files under `tests/`. They use a mock Supabase query builder
  (see `tests/dataManager.test.mjs`) — extend it with new builder methods
  (e.g. `.range()`) when production code adds them.
- Regression suites: `tests/economy-fixes.test.mjs`, `tests/batch2-fixes.test.mjs`,
  `tests/security-hardening.test.mjs` (C1 negative-balance, C2 automation bounds,
  H1 checkout binding/idempotency, H2 cooldowns, M3 component-token ownership).
