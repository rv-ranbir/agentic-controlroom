# Handoff: AgentRoom — Multi-Agent Supervision UI

## Overview
AgentRoom is a supervision surface for running many coding agents (default design: 14) in parallel across projects/repos. It answers one question at a glance — "who is blocked on me?" — via a roster bucketed by state, a live per-agent activity rail, a conversation/tool-call stream per agent, and a diff review flow. Also included: a project launcher with local-folder/repo connection and a "new agent" creation flow (role templates + fully custom agents), and an isolated component sheet in both dark and light themes.

## About the Design Files
The `.dc.html` files in this bundle are **design references built in a prototyping tool's own component format** — not production code. They render correctly on their own (each is self-contained HTML/CSS/JS with a tiny custom runtime script tag), but they are **not** React/Vue/etc. and should not be copied into a real codebase as-is.

**Your task is to recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, or whatever the app already uses) using its established component patterns, state management, and libraries. If no environment exists yet, choose the framework best suited to the project and implement the designs there. Treat every file as a precise visual and interaction spec: exact copy, layout, states, colors, and behaviors should carry over; only the implementation technology changes.

## Fidelity
**High-fidelity.** All five files are pixel-specific mockups with final colors (hex values below), typography, spacing, and working interactions (simulated with local component state). Recreate the UI pixel-perfectly using the target codebase's component library, substituting real data/APIs for the simulated state.

## Design system basis
Built on top of a bound design system called "Organic" (warm cream/terracotta, Caprasimo display + Figtree body, 16px-family radii) — see `design-system/readme.md` and `design-system/styles.css` for the source tokens. AgentRoom **inverts** this system for a dark-first, low-chrome supervisory tool: it keeps Organic's warm neutral hue family and its two accent roles (terracotta, sage) but drives the neutral ramp dark-first, strips container fills/borders down to hairlines, and disciplines the two saturated colors to single, non-overlapping meanings (see Design Tokens and State System below). Figtree and the type scale are inherited from Organic; a monospace face (Spline Sans Mono) is added specifically for this product's terminal/code-heavy content.

## Screens / Views

### 1. Design plan (`AgentRoom - Design plan.dc.html`)
Not a shippable screen — a rationale document (palette, type, state system, layout skeleton) explaining the design decisions below. Useful background reading before implementing; skip if you just need the specs.

### 2. Room (`AgentRoom - Room.dc.html`) — the main/primary screen
**Purpose:** Supervise all agents in one project; drill into any agent's live stream; act on it without leaving the view.

**Layout:** Full-viewport, `height:100vh`, `overflow:hidden` (no page scroll — internal panes scroll independently). Vertical stack:
- **Header bar**, 46px tall, flex row, `padding: 0 16px`, border-bottom 1px hairline. Contents left→right: status dot + wordmark "AgentRoom" (Caprasimo, 16px) → 1px vertical divider → project-switcher pill button (cycles through 3 demo projects) → branch label (monospace, dim) → flexible spacer → transient toast message (monospace, dim) → "Blocked" counter (label + pill badge, terracotta-filled when count > 0) → theme toggle button.
- **Body**, `flex:1`, horizontal flex, three regions:
  1. **Roster sidebar**, 284px fixed width, background one step lighter than page ("deck" token), right border hairline. Scrollable list grouped into 5 sticky-headed buckets (Needs input, To review, Active, Seen, Inactive) each showing a count; buckets with zero rows are omitted entirely. Footer strip: "j / k · walk" hint + agent count.
  2. **Rail**, 54px fixed width, background = page color, borders both sides. A `<canvas>` filling the vertical space renders one lane per agent (14 lanes) as a continuously-scrolling strip chart — see Interactions below.
  3. **Main pane**, `flex:1`, vertical stack: a fixed-height **agent header** (role monogram chip, task title, identity-color dot, agent name · repo, state pip + label + stat line, raw/structured toggle button, and an action-button row that wraps under the title on narrow widths) → scrollable **stream** (conversation/tool-call blocks) → fixed **composer** (pill text input + hint row + send button).

**Components, in detail:**

- **Agent row** (roster). Height 50px (44px if idle). Flex row, `gap:11px`, `padding:0 12px 0 10px`. Children: 21px-wide monospace two-letter role monogram (600 weight, 10.5px, `letter-spacing:.06em`) with a 2px bottom inset box-shadow tinted the agent's identity color; a flex-1 column of task title (600/700 weight Figtree, 12.5px, `letter-spacing:-.01em`, single-line ellipsis) over a monospace 10.5px meta line (repo · timing); a right-aligned meta value (monospace 10.5px — "reply ⏎", "+42 −7", elapsed time, or "✓"). Selected row gets a subtle full-row tint.
- **State treatment (the core visual system — do not deviate):**
  - `needs` (blocked): the **only** filled state — solid terracotta background, near-black text (`#1B1814` on both themes), no left edge (the fill itself is the signal). Meta reads "reply ⏎".
  - `review`: ink-colored 2px left edge (inset box-shadow), full-opacity text. Meta shows a diff stat.
  - `active`: sage 2px left edge, text at 74% ink opacity. Meta shows elapsed time in sage.
  - `seen`: neutral-rule-colored 2px left edge, text at 50% ink opacity. Meta shows a checkmark.
  - `idle`: no edge, text at 32% ink opacity, shorter row height, no meta/sub line.
  - This is a **figure/ground + luminance-decay** system, not a hue system: only two colors are ever saturated (terracotta = blocked/needs-input, sage = active/live) and they never share a channel — terracotta is always a fill, sage is always a thin mark. All other distinction comes from ink opacity steps (100/74/50/32%).
- **Role monogram**: fixed 2-letter code in the monospace face, inherits the row's ink opacity (never has its own color) so a dim row's monogram dims with it. An optional identity color (one of 8 curated swatches) rides as a thin underline/bottom-inset on the monogram only — a third channel that never touches state color.
- **Rail** (signature element): one vertical lane per agent, newest activity at the top of each lane, ticks drift downward and fade as they age (linear opacity falloff over the visible height). Normal ticks render in sage at ~2.5px tall; a tick coincident with an agent going into "needs input" renders in terracotta at ~4px tall and near-full opacity — so a blocked state announces itself on the rail before the roster is read. Selected agent's lane gets a faint full-height highlight. Respects `prefers-reduced-motion` (renders a static snapshot, no animation).
- **Agent header actions** (pill buttons, monospace 10.5px, transparent bg / 1px rule border, hover = border+text brighten): pause/resume, reassign, fork, "terminal ↗" (opens full terminal), mark-reviewed (this one is filled — ink background, paper text — until the agent is in "seen" state, then becomes an outlined "reviewed ✓" and is effectively disabled-looking).
- **Stream blocks** (each has a fixed 52px left gutter for a timestamp or "you" label):
  - **User message**: plain text, ink color, left border 2px hairline for indent.
  - **Prose** (agent's own reasoning/narration): 74%-opacity ink text; if it's the live/still-streaming block for an active agent, text is truncated to a simulated typed-so-far length with a blinking monospace-width caret block at the end.
  - **Tool call**: dark "sink" panel, rounded 8px, 1px rule border. Header row: bold monospace call signature (e.g. `Read(path)`) left, dim monospace result summary right. Optional expandable body below a divider, monospace, preformatted, dim.
  - **Diff**: same sink panel. Header: filename (mono, bold) + green `+n` / terracotta `−n` stat + right-aligned verdict text ("awaiting review" dim / "approved" sage / "rejected" terracotta). Body: line-by-line monospace at 11.5px/1.75, each line tinted a translucent green or terracotta wash for added/removed, plain for context, with a dim 22px-wide line-number gutter. If pending, a footer row offers **approve** (filled sage pill) and **reject** (outlined pill) buttons plus a "⌘⏎ approves" hint.
  - **Needs-input / ask block**: full terracotta-filled card, near-black text, "NEEDS INPUT" eyebrow label, the question in bold Figtree, and a row of pill choice buttons (translucent black on the terracotta fill).
  - **Note** (system divider, e.g. "waiting on review · 6m"): small dim monospace label plus a flex-1 hairline rule, no gutter.
- **Raw/structured toggle**: swaps the entire stream body for a plain monospace `<pre>` transcript of the same content (tool calls become `$ command` lines, diffs become unified-diff text, etc.) — for users who prefer a terminal-literal view.
- **Composer**: pill-shaped monospace input (`border-radius:999px`, 1px rule border, focus = terracotta border), placeholder changes to "Answer {name}…" when the selected agent is blocked. Hint row below: "⏎ send", "⌘⏎ approve", "esc roster". Filled ink "send" pill button to the right.

### 3. Launcher (`AgentRoom - Launcher.dc.html`)
**Purpose:** Entry point — open an existing project or create a new agent.

**Layout:** Full-viewport vertical stack: thin header (wordmark + theme toggle) over a centered scrollable column (max-width 760px).

**Components:**
- **Greeting row**: large Caprasimo H1 ("Open a project") + a filled "+ new agent" pill button, top-aligned, wraps on narrow widths.
- **Sub-line**: one sentence of explanatory copy, 74%-opacity ink, max ~52 characters wide.
- **Tab switcher**: two pill buttons, "Local folder" / "Repository" — filled ink when active, outlined when not.
- **Local folder panel**: dashed-border drop zone (highlights on drag-over) with a "drop a folder, or [browse…]" affordance, plus a list of recent local folders (icon, name, path, "opened Nago" meta).
- **Repository panel**: URL text input + "connect" button, explanatory copy about branching/PR behavior, plus a list of org repos with visibility labels.
- **Open rooms list**: existing project rooms as clickable rows — status-color dot, name, agent count + branch, and a status badge (e.g. "2 blocked" filled terracotta, "1 to review" neutral).
- **New-agent modal** (opens over a `rgba(0,0,0,.5)` backdrop, click-outside or × closes it): a 560px-wide card containing, top to bottom:
  1. Header: "New agent" title + "Added to {project}" eyebrow + close ×.
  2. **Name** text field.
  3. **Agent template** picker: a search box filtering a categorized grid (groups: "Core team", "Specialists", "Community" — ~19 predefined role templates total, each a 2-letter monogram + label button in a 4-column grid) plus a dashed "+ Custom agent" card. Selecting Custom reveals: a custom role label field, a freeform "Rules — how it should behave" textarea, and a skill-tag input (type + Enter to add a removable chip) — this is how a fully custom agent's behavior/skills are authored, distinct from picking a template.
  4. **Engine** picker: pill button group (e.g. Claude Code / Codex / Cursor).
  5. **Model** picker: card button group (Opus/Sonnet/Haiku + a "Custom…" option) each showing a one-line hint; selecting Custom reveals a free-text model-id input.
  6. **Context window** and **Reasoning effort**: two side-by-side pill button groups.
  7. **Advanced options** (collapsed by default, disclosure triangle toggle): three labeled checkboxes (open right away / new worktree per agent / browser access) each with a one-line explanation, a CLI-flags text input, and a system-prompt textarea (placeholder notes it inherits the role default).
  8. Footer: cancel (outlined) / "create agent" (filled ink) buttons.

### 4. Review pane (`AgentRoom - Review.dc.html`)
**Purpose:** Focused code-review view for one agent's pending diff, with its originating conversation alongside for context.

**Layout:** Full-viewport vertical stack: thin header (back button, role monogram, agent name, repo·branch, theme toggle) over a two-pane body:
- **Left, flex-1**: a fixed summary strip (task title, +/− stat, file count) over a scrollable list of files, each with a sticky dark filename header (filename, +n green, −n terracotta) and its diff lines rendered exactly as in the Room's diff block (translucent add/remove washes, dim line-number gutter).
- **Right, 380px fixed, "deck" background**: "Conversation" eyebrow header over a scrollable list of chat turns (dim monospace sender label + Figtree body text, user turns get a left hairline indent), with a fixed footer of side-by-side approve (filled sage)/reject (outlined) buttons and a verdict/hint line beneath.

### 5. Component sheet (`AgentRoom - Components.dc.html`)
**Purpose:** Isolated reference for every reusable primitive, dark and light side by side.

**Layout:** Single scrolling page, dark page background (`#0F0D0B`, intentionally outside both themes so the two panels read clearly), a two-column grid of theme panels (`data-panel="dark"` / `data-panel="light"`) each 12px-radius rounded card containing, stacked: the five-state agent row group, a tool-call block, a needs-input block, a row of the 5 status-indicator dot+label pairs, and a composer input at rest.

## Interactions & Behavior
- **Roster navigation**: click any row to select it, or `j`/`k` keys to walk the roster in bucket order (needs → review → active → seen → idle) — the mouse is optional throughout. `Enter` (outside the input) focuses the composer.
- **Replying**: typing in the composer and pressing Enter (or clicking send) appends a "you" block and a canned acknowledgment, and flips the agent from `needs`/other back to `active`.
- **Approve/reject a diff**: approve sets the diff's verdict to "approved", flips the agent to `seen`, and fires a header toast ("Approved · {name} merged to {branch}"). Reject sets "rejected" and flips the agent back to `active`. `⌘/Ctrl+Enter` in the composer approves the current pending diff directly.
- **Pause/resume, reassign, fork, terminal, mark-reviewed**: each fires a header toast (2.6s auto-dismiss) describing the action; pause/resume and mark-reviewed also mutate the agent's state (idle↔active, →seen respectively). These are stubs to wire to real actions.
- **Raw/structured toggle**: purely a view-mode flip per agent, no state mutation.
- **Rail animation**: continuous `requestAnimationFrame` loop advancing tick positions and spawning new ticks per lane at a rate tuned per lane (busier agents tick more often); pauses/renders static under `prefers-reduced-motion: reduce`.
- **Theme toggle**: flips a `data-theme="dark"|"light"` attribute on `<body>`, which the CSS custom properties key off of. Default is dark.
- **Launcher drag-and-drop**: the drop zone highlights its dashed border and background on `dragover`; drop handling is a stub (wire to a real folder picker / File System Access API).
- **New-agent modal**: fully local component state — role/template search filters the grid live, template selection and "Custom agent" are mutually exclusive, skill chips add on Enter and remove on ×, all fields are stubs to wire into a real agent-creation request. "create agent" currently just closes the modal and fires a toast.

## State Management
Minimum state shape per agent (drives both Room and Launcher):
```
{
  id, mono (2-letter role code), name, task, repo, since,
  state: "needs" | "review" | "active" | "seen" | "idle",
  ident: <hex color> // optional identity accent
}
```
Per-agent conversation is a list of typed blocks: `user | prose | tool | diff | ask | note`, each with the fields shown in the Stream blocks section above (diff blocks additionally carry file/plus/minus/lines/pending/verdict). The Room mockup keeps a small hard-coded map of agent id → block list as demo data; in production this is presumably a live transcript from each agent's session.
Other state: selected agent id, draft composer text, transient toast message, theme, current project index (Room's project switcher is a demo stub — in production this should be real project/room switching), and the full new-agent form state (name, role/template or custom rules+skills, engine, model, context, effort, advanced toggles, CLI flags, system prompt).

## Design Tokens

**Color** (dark theme default; light-theme values in parens — both are fully designed, toggle via `data-theme`):
- `--paper` (page bg): `#1B1814` (`#F5EAD8`)
- `--deck` (sidebar/panel bg): `#241F1A` (`#EBDDC5`)
- `--sink` (recessed panel bg, e.g. tool/diff blocks): `#151210` (`#E2D2B6`)
- `--rule` (hairline borders): `#3A332B` (`#D0C2A6`)
- `--ink` (primary text/fg): `#F0E7D6` (`#201E1D`)
- `--signal` (terracotta — needs-input fill ONLY): `#D67F48` (`#B2622D`)
- `--live` (sage — active/live mark ONLY): `#AEBF92` (`#56633F`)
- Ink opacity steps used for state decay: 100%, 74% (`--ink-70`), 50% (`--ink-50`), 32% (`--ink-34`), 14% (`--ink-16`)
- Diff washes: `--plus` = sage at ~13% alpha, `--minus` = terracotta at ~13% alpha
- Identity swatches (8, cycle through for custom agent colors): `#8AA1C4 #B98AC0 #7FB0A6 #C6A366 #B4A6D6 #C48A8A #A8A88A #D67F48`

**Typography:**
- Display: Caprasimo (`var(--font-heading)`, inherited from Organic) — page titles / wordmark / empty states only.
- Body/UI: Figtree (`var(--font-body)`, inherited from Organic) — chrome, labels, task titles, prose, form fields.
- Code/mono: Spline Sans Mono (`--mono`, added for this product) — role monograms, timestamps, meta stats, tool calls, diffs, terminal content. Load via Google Fonts: `Spline+Sans+Mono:wght@300;400;500;600`.
- Scale in use: 44px/52px display H1, 15–17px body copy, 12.5–15px UI titles, 10–11.5px monospace meta/labels (with `letter-spacing: .06em–.16em` on all-caps monospace labels).

**Spacing / radius:** roster row height 50px (44px idle), header bar 46px, rail 54px wide, roster 284px wide, review-pane conversation rail 380px wide. Radius: 8px for panels/inputs, 12px for modal/cards, `999px` (pill) for all buttons and the composer input. Borders are always 1px hairlines — no card drop-shadows.

## Assets
No bitmap/vector assets — everything is CSS-drawn (dots, canvas-rendered rail, monospace glyphs as monograms). No icons beyond a few Unicode glyphs (▾ ✓ × ⏎ ↗ ▸▾). The `<canvas>` rail is drawn procedurally in JS (see Room file, `startRail()`), not an image — reimplement as an equivalent canvas or SVG/WebGL strip-chart in the target stack.

## Files
- `AgentRoom - Design plan.dc.html` — rationale document (background reading)
- `AgentRoom - Room.dc.html` — primary screen (roster, rail, stream, composer, actions)
- `AgentRoom - Launcher.dc.html` — project picker + new-agent creation modal
- `AgentRoom - Review.dc.html` — dedicated diff review pane
- `AgentRoom - Components.dc.html` — isolated component/state reference, dark + light
- `design-system/styles.css`, `design-system/readme.md` — the underlying "Organic" design-system tokens (colors, type, radii) that AgentRoom's own tokens are derived/inverted from
