# Room Illustration — Design Spec (M10 phase 4b)

Target: Chat Room + Meeting Room skeuomorphic restyle, Agentic Control Room.

## Style

- Flat vector / cutout illustration. Clean flat shapes, limited palette, editorial-illustration look.
- NOT painterly, NOT isometric, NOT pixel-art, NOT 3D-rendered.
- No gradients, no drop shadows, no soft blur — flat fills and hard edges only.

## Palette (locked — app's existing warm dark theme tokens, do not invent new colors)

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#1B1814` | base/background |
| `--signal` | `#D67F48` | accent (orange) |
| `--live` | `#AEBF92` | accent (sage green) |
| `--ink` | `#F0E7D6` | highlights/text/linework |

## Asset 1 — Room background

- Scene: office/chat-room interior — desks, whiteboard (simple diagram marks, not readable text), window, minimal furniture (plant optional).
- Empty of characters — background plate only, characters composite on top separately.
- Composition: wide horizontal, works as a fixed backdrop behind a scrollable/layered UI panel (leave visual breathing room — don't cram detail into the vertical center third where UI chrome may sit).
- Format: flat 2D, no perspective tricks beyond simple flat depth cues (foreground/midground/background shape layering, not vanishing-point 3D).

## Asset 2 — Character sprites (per agent role instance)

- 4 states per character: **idle**, **talking**, **typing**, **away**.
- Small/sprite scale — designed to be placed multiple at once inside the room scene, not a hero illustration.
- Gender-neutral, minimal/faceless or near-faceless design (keeps it generic across arbitrary agent roles/names).
- Isolated on transparent/plain background, no shadow — matches flat cutout style, composites directly onto Asset 1.
- Pose language:
  - idle — neutral standing, relaxed
  - talking — mid-gesture, one hand raised/animated
  - typing — seated at small desk, hands on laptop
  - away — turned away or slumped/faded posture (visually distinct at a glance from idle)

## Deliverable count for prototype phase (not full production set)

- 1× room background (Asset 1)
- 2-3× character states (Asset 2) — enough to judge the style, not all 4 yet

## Gate

Do not wire backgrounds/characters into Chat Room or Meeting Room components until user signs off on this prototype style. This is the highest-risk/highest-effort item in M10 — a wrong guess here is expensive to redo.

Reference: `SPEC.md` §M10 phase 4b, memory note `agentroom_m10_visual_restyle`.
