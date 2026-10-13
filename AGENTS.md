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
  (`moneyAdd`/`moneySub`/`toMoney`/`moneyGte`/`moneyLt`) so late-game values
  (1e170-scale) stay finite and compare with relative tolerance.
- Booster parsing/activation goes through `utils/boosts.js`
  (`normalizeBooster`, `getActiveBoostMultiplier`, `getActiveInstantCashSeconds`).
- Upgrade purchases go through `utils/upgradeEngine.js` (`planUpgrade`) and
  `utils/purchaseAmount.js` (`parsePurchaseAmount`, `resolvePurchaseCount`).
- `deriveUserPatch(baseline, candidate)` returns changed fields only. Snapshot
  updates pass a `getUser()` document; partial updates are diffed against the
  live row inside the transaction so unrelated fields are never clobbered.
- Full-table scans must stream: use `forEachUserPage` / `forEachUser` in
  `dataManager.js`, never a bare `.select('*')` over `users`.
- Component custom IDs must not embed user IDs; use
  `interactionSessions.createComponentToken()` and verify ownership with
  `isComponentOwner(interaction, ownerId)`.
- Activity marking (`markUserActive`) is throttled and best-effort; it must
  never block a command response.
- `getMineFactor(mine)` reads `prestige_count` from the mine object; passing a
  bare mine name ignores prestige.

## Testing
- Tests are `.mjs` files under `tests/`. They use a mock Supabase query builder
  (see `tests/dataManager.test.mjs`) — extend it with new builder methods
  (e.g. `.range()`) when production code adds them.
- Regression suites: `tests/economy-fixes.test.mjs`, `tests/batch2-fixes.test.mjs`.
