<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Rainbow Icecream — project conventions

Investment portfolio management app. Update this file as new conventions/decisions come up during work — don't wait to be asked.

## Stack (non-negotiable)
Next.js 16 **Pages Router** (never App Router) · Supabase (Postgres + Auth) · Toss 증권 Open API · shadcn/ui "base-nova" (built on **Base UI**, not Radix — verify via no `radix-ui` deps) + Tailwind · TanStack Query for all server state · TypeScript · pnpm · Recharts.

## Next.js 16 breaking changes
- `middleware.ts` → `proxy.ts`, `export function middleware` → `export function proxy`.

## Data model rules
- Never persist `current_price` / any live-market-derived value in the DB — always fetched live from Toss at read time and computed in `lib/calc/rebalance.ts`. See the comment in `supabase/schema.sql`.
- A holding with `ticker: null` (e.g. cash-like assets) is intentional — it means "skip live price lookup, use `avgPrice` as the value." Never treat this as missing data to backfill.
- `REBALANCE_THRESHOLD` (`lib/calc/rebalance.ts`) = 5 percentage points — the app-wide "close enough to on-target" cutoff for diff/actionLabel/rebalance-needed logic.

## Setup page edit pattern (draft/staging, not autosave)
`/setup`'s edit mode is a true local draft: entering edit mode copies server state into `DraftGroup[]`/`DraftHolding[]` (`lib/setupDraft.ts`), and **nothing** touches Supabase until "완료" is clicked (`commitSetupDraft`, which diffs draft vs. original and replays only the changes). "취소" discards the draft with zero server calls — this must cover additions/deletions of groups and holdings too, not just field edits. Don't reintroduce onBlur-autosave on this page.

## Toss API quirks
- Every response is wrapped in a `{"result": ...}` envelope — undocumented, only discovered via direct `curl` against the real API. Zod schemas must unwrap `.result`.
- No WebSocket support ("추후 지원 예정"). Poll at 1-minute intervals (`hooks/useLivePrices.ts`, `hooks/useExchangeRate.ts`) with adaptive backoff on rate-limit signals — never assume sub-minute polling is safe.
- Fields like `timestamp`/`currency` can come back `null` (not just absent) for non-priceable symbols — Zod schemas need `.nullish()`, not `.optional()`.

## UI conventions
- **Never use `<input type="number">`** bound directly to a numeric state with per-keystroke `Number(e.target.value)` — causes a leading-zero bug. Use `type="text"` + `inputMode="decimal"` with local string draft state, parsed on blur. Reuse `useEditableField`/`useEditableNumberField` (`hooks/useEditableField.ts`) rather than reinventing this.
- shadcn `<Select>` needs an explicit `items` prop on the root or the trigger shows the raw value instead of the resolved label.
- Delete unused generated files outright (e.g. shadcn components that end up unused) rather than leaving dead code or stripped-down stubs.
- Title-weight text (page `<h1>`s, group/item names, nav logo) uses `font-semibold`, not `font-bold`.
- "On target" / success states use the app's mint `GOOD_COLOR` (exported from `lib/calc/rebalance.ts`), not a generic green — keep this the one semantic "good" color across pages.

## Lint / build discipline
- React purity ESLint rules (`react-hooks/set-state-in-effect`, `react-hooks/purity`, `react-hooks/immutability`) are enforced strictly: no mutating a local variable across a `.map`/loop during render (use `reduce`/derive per-item instead), no synchronous `setState` in an effect body (only from subscription/interval callbacks), no impure calls (`Date.now()`, `crypto.randomUUID()` outside event handlers, etc.) during render.
- Before considering any change done, run `pnpm typecheck && pnpm lint && pnpm build` — all three must pass clean.

## Security
- Never print secrets (tokens, `.env` values) in tool output. When redacting config/secret-adjacent data, redact recursively — including array elements, not just dict values (a past redaction script missed array-nested strings and leaked a live Supabase PAT).
