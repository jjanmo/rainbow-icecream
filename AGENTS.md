<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Rainbow Icecream — project conventions

Investment portfolio management app. Update this file as new conventions/decisions come up during work — don't wait to be asked.

## Stack (non-negotiable)
Next.js 16 **Pages Router** (never App Router) · Supabase (Postgres + Auth) · Toss 증권 Open API · shadcn/ui "base-nova" (built on **Base UI**, not Radix — verify via no `radix-ui` deps) + Tailwind · TanStack Query for all server state · TypeScript · pnpm · Recharts · dnd-kit (drag-and-drop reordering of both groups and holdings, `/setup` only).

## File structure
App code lives under `src/` (`src/pages`, `src/components`, `src/hooks`, `src/lib`, `src/types`, `src/styles`, `src/proxy.ts`) — see ADR-0011. `public/`, config files (`next.config.ts`, `tsconfig.json`, `components.json`, etc.), `docs/`, and `supabase/` stay at the repo root per Next.js convention. Path references below (`lib/...`, `hooks/...`) are relative to `src/`.

## Next.js 16 breaking changes
- `middleware.ts` → `proxy.ts`, `export function middleware` → `export function proxy`.

## Data model rules
- Never persist `current_price` / any live-market-derived value in the DB — always fetched live from Toss at read time and computed in `lib/calc/rebalance.ts`. See the comment in `supabase/schema.sql`.
- A holding with `ticker: null` (e.g. cash-like assets) means "skip live price lookup, use `avgPrice` as the value" in `lib/calc/rebalance.ts`. `HoldingFormDialog` has a KRW/$ checkbox row (below 보유수량/평균매입가) for this: checking one sets `region` to match (국내/해외), disables the 코드/티커 input, and collapses 보유수량+평균매입가 into a single 금액 field — on submit `ticker` is forced to `null`, `qty` to `1`, and the entered 금액 becomes `avgPrice` (see ADR-0022 for the exact DB mapping — there's no dedicated amount column). Unchecked (default) requires a non-empty 티커/코드 + separate 보유수량/평균매입가 as before.
- `REBALANCE_THRESHOLD` (`lib/calc/rebalance.ts`) = 5 percentage points — the app-wide "close enough to on-target" cutoff for diff/actionLabel/rebalance-needed logic.
- A holding's color index is pinned to **creation order** (`created_at`, `id`) within its group, deliberately decoupled from display order (`sort_order`) so drag-reordering on `/setup` never repaints holdings (ADR-0025). `computeRebalance` builds both orders separately — don't collapse them back into one.
- `holdings.sort_order` drives display order within a group (`/setup`'s drag-and-drop, ADR-0015) — keep `lib/api/holdings.ts`'s `order()` clause and `lib/calc/rebalance.ts`'s `byOrderThenCreatedThenId` in sync if either changes, or displayed order and persisted order will drift apart. `asset_groups.sort_order` works the same way for groups (ADR-0019).
- Asset groups have **no color column** — `flavor_index` was deliberately removed. A group's color is derived purely from its position among the user's groups (`hueForGroupIndex(index, total)` in `lib/calc/color.ts`), evenly spaced around the hue wheel so any number of groups stays visually distinct. There is no user-facing color picker for groups anymore (ADR-0019) — don't reintroduce one without checking with the user first.

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
- `fmtPct` (`lib/format.ts`) defaults to 2 decimal digits — don't pass a lower `digits` override for allocation %, it rounds small values down to a misleading "0%".
- `shortHoldingLabel` (`lib/format.ts`) is the label for tight spots (the group donut's center readout): ticker for 해외 holdings, plain 종목명 for everything else. Don't try to strip brand prefixes from 국내 names — that was tried and rolled back (names like `KODEX 200` degrade to a bare `200`).
- `Checkbox` (`components/ui/checkbox.tsx`, base-nova/Base UI) is available — added when `HoldingFormDialog` needed a KRW/$ toggle.

## Lint / build discipline
- React purity ESLint rules (`react-hooks/set-state-in-effect`, `react-hooks/purity`, `react-hooks/immutability`) are enforced strictly: no mutating a local variable across a `.map`/loop during render (use `reduce`/derive per-item instead), no synchronous `setState` in an effect body (only from subscription/interval callbacks), no impure calls (`Date.now()`, `crypto.randomUUID()` outside event handlers, etc.) during render.
- Before considering any change done, run `pnpm typecheck && pnpm lint && pnpm build` — all three must pass clean.

## Security
- Never print secrets (tokens, `.env` values) in tool output. When redacting config/secret-adjacent data, redact recursively — including array elements, not just dict values (a past redaction script missed array-nested strings and leaked a live Supabase PAT).
