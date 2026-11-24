---
name: flython:ui-polish
description: Fix and refactor web UI in customer-web or staff-web so it matches the intended design, using the app's shadcn/ui components and Tailwind, then verify it in a real browser at several viewport sizes. Use this whenever the user asks to polish, clean up, fix, restyle or refactor UI, or mentions spacing, whitespace, padding, alignment, layout, typography, fonts, a component that looks off, "make this match the design/Figma/mockup", mobile or responsive problems, or swapping custom markup or hand-written CSS for shadcn components, even if they never say "shadcn" or "polish".
---

# UI polish

Make a screen look the way it was designed, built from the app's shadcn/ui components, and prove it in a real browser. Reading the code and judging it looks right is not enough, because spacing, wrapping and overflow bugs only show up when the page is rendered at real widths.

## 1. Orient before editing

Repo docs lag the code (CLAUDE.md files still say shadcn/Tailwind are "not installed"), so check what is real:

- Read the target app's `package.json` and `components.json`. Both `apps/customer-web` and `apps/staff-web` use shadcn (style `new-york`, Lucide icons, `cssVariables: true`), Tailwind 4 via `@tailwindcss/vite`, and `cn()` from `src/lib/utils`.
- List `src/components/ui/` to see which shadcn components already exist. Reuse them. Look at an existing usage in the app before writing a new one so the new code follows local conventions (import alias `@customer-web/*` or `@staff-web/*`, no semicolons, single quotes).
- Work in one app only. Customer and staff apps are separate; do not edit the other one, and say so if a change really needs both.
- Stay in your lane per the root CLAUDE.md: edit the feature or route you were asked about. Shared components in `components/ui/` and `index.css` theme tokens are shared code. If the fix needs a change there, say so and ask first, unless the user already asked for it.
- Never read `.env*` files.

## 2. Find the design source of truth

"Matching the design" needs something to match. Look in this order and use the first that exists:

1. A Figma link or node the user gave (use the Figma tools/skills available in the session).
2. A screenshot, mockup or file the user attached or pointed to, or a design doc under `docs/`.
3. The existing design tokens and neighbouring screens (colors, radius, font, spacing already used in `index.css` and sibling pages).

If there is no design reference at all, say that you are matching existing app conventions rather than a mockup, so the user can correct course early. Do not invent a new visual direction.

## 3. See the problem first

Start the dev server (`npm run dev -w apps/<app>`; ports 5151 customer, 6161 staff) and capture the current state in a real browser before changing anything. Use whichever browser tool the session offers (a browser skill, built-in browser pane, or Chrome extension). Capture at least:

- mobile ~375px, tablet ~768px, desktop ~1280px

Pages behind Clerk sign-in need a signed-in session. If the browser is not signed in, ask the user to sign in there rather than building any auth workaround. If the page needs backend data, `npm run db:up` and the backend may need to be running; if you cannot get the screen rendered, tell the user instead of guessing from code.

Write down the concrete defects you see (e.g. "card padding is 12px, design is 24px", "buttons wrap under the title at 375px") so the fix is targeted and you can check each one afterwards.

## 4. Fix it

- **Prefer shadcn components over custom markup.** Replace hand-rolled buttons, inputs, dialogs, tabs, badges, tables etc. with the matching component from `components/ui/`. If the component you need does not exist yet, add it with the shadcn CLI from inside the app (`npx shadcn@latest add <name>` in `apps/<app>`), then check the diff it produced; it must only add the new file (and dependencies it needs). Confirm with the user before adding a dependency to `package.json`.
- **Tailwind utilities and theme tokens, not magic values.** Use the scale (`gap-4`, `p-6`) and semantic colors (`bg-background`, `text-muted-foreground`, `border`) instead of arbitrary values or hex codes. Use `cn()` to merge classes. Delete hand-written CSS that the utilities replace.
- **Spacing and layout.** Pick one spacing rhythm per section and apply it consistently: `gap-*` on flex/grid parents rather than margins on every child, consistent container padding, `max-w-*` plus `mx-auto` for page width. Align baselines and edges; look for off-by-a-few-pixel inconsistencies between sibling elements. Give each gap a single owner (prefer `gap-*` on the parent) because padding never collapses, so adjacent sections' bottom and top padding double up (40px + 40px = 80px), and a base override like `pb-0` loses to a breakpoint variant like `md:py-10`, so repeat it at the same breakpoint (`pb-0 md:pb-0`).
- **Typography.** Use the app's font family and the Tailwind type scale. Keep one heading hierarchy per page, set `leading-*`/`tracking-*` deliberately, and use `text-muted-foreground` for secondary text instead of ad-hoc greys.
- **Responsive by default.** Write mobile-first (base styles for small screens, `sm:`/`md:`/`lg:` to enlarge). Stack on mobile and go multi-column later; make tables scroll or reflow; keep tap targets at least ~40px; avoid fixed widths that cause horizontal scroll.
- **Keep behavior intact.** Polish should not change data flow, routing or props contracts. Keep accessibility: semantic elements, labels, visible focus states, keyboard reachability (shadcn/Radix gives most of this for free if you do not bypass it).
- Keep the diff small and on-task. Do not refactor unrelated code.

## 5. Verify in the browser

Reload and re-capture at the same three widths, then compare against the design reference and against your defect list from step 3. Also check:

- no horizontal scrollbar at 375px
- long text, empty states and loading/error states still look right if the screen has them
- interactive states you touched (hover, focus, open dialog/popover, disabled)
- browser console has no new errors or warnings

If something is still off, fix and re-check. Do not report "done" from code reading alone; if you could not verify in a browser, say exactly what you could not check.

Then run the app's checks and report real output, including failures: `npm run lint`, `npm run format:check`, `npm run build` with `-w apps/<app>` (run `npm run format` / `lint:fix` rather than hand-formatting).

## 6. Report

Finish with a short summary in this shape, nothing longer:

```
**What changed**
- <one line per visible change, e.g. "Booking summary card now uses 24px padding and stacks below 768px">

**shadcn components used**
- <Component> (existing | newly added) — where it's used

**Files affected**
- apps/<app>/src/...

**Verified**: <widths/browser checked, lint/format/build results>. <Anything not verified or left for the user.>
```

Do not commit or push unless the user asks (see the root CLAUDE.md for branch and commit rules).
