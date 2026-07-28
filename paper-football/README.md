# Paper Football

A two-player, pass-and-play HTML5 pitch game. One ball, a lattice of nodes, a
trail of dots you can never step on twice — and an Onitama-style hand of
movement cards each player drafts before kickoff.

**Landscape-only. Non-zoomable. Built for a phone held sideways.**

> **This file is the spec.** Read it in full before making any change to this
> sub-project. Every rule, constant, colour and animation the game relies on is
> written down here. If a change alters behaviour, update this file in the same
> commit.

---

## 1. Rules

### 1.1 Board

- The board is a **lattice of nodes**, not a grid of squares. Pieces sit *on*
  the intersections; the faint grid lines are the connections between them.
- Two sizes, chosen from a dropdown on the start screen:
  - **7 × 15** — 7 rows × 15 columns (105 nodes)
  - **9 × 15** — 9 rows × 15 columns (135 nodes)
- Coordinates are `(col, row)`, both 0-indexed, `col` running left → right,
  `row` running top → bottom.
- Both dimensions are odd, so there is always an exact centre node.

### 1.2 Setup

| Thing | 7 × 15 | 9 × 15 |
|---|---|---|
| Ball (kickoff) | `(7, 3)` | `(7, 4)` |
| Player 1 goal — keeper **M** | `(0, 3)` | `(0, 4)` |
| Player 2 goal — keeper **S** | `(14, 3)` | `(14, 4)` |

- **Player 1 = Blue = keeper `M`**, defending the **left** goal at column 0.
- **Player 2 = Red = keeper `S`**, defending the **right** goal at column 14.
- The ball starts on the centre node. Player 1 moves first.

### 1.3 The turn

1. It is one player's turn. The ball is wherever the last move left it.
2. The player taps the ball (or any of their three cards) to see where they may
   go. Tapping the **ball** highlights the union of every legal destination
   across all three of their cards. Tapping a **card** narrows the highlight to
   just that card's destinations.
3. The player taps a highlighted node. The ball travels there.
4. The node the ball just left becomes a **dead node** — drawn as a faint grey
   dot — and can never be landed on again by either player, for the rest of the
   game.
5. A coloured line is drawn from the old node to the new one. The line is
   drawn in the **moving player's colour**, so the game builds a visible
   blue/red record of the whole rally.
6. Turn passes to the other player.

### 1.4 Legal destinations

A destination node is legal if **all** of these hold:

- It is reachable by one of the offsets on one of the current player's three
  cards (see §2).
- It is inside the board.
- It is **not** a dead node.
- It is **not** the node the ball is currently on.

Goal nodes are *always* legal targets when a card reaches them — landing on one
ends the game (§1.5). Goal nodes never become dead nodes.

The ball **jumps** to its destination; nodes it flies over are not consumed and
do not block the move. Lines may cross each other freely.

### 1.5 How the game ends

- **Goal.** The ball lands on a goal node. The player who *owns* that goal
  **loses** — so a ball reaching `M`'s node at column 0 is a win for the Red
  player, and a ball reaching `S`'s node at column 14 is a win for the Blue
  player. This is true regardless of who moved the ball there; you can be
  forced, or blunder, into your own net.
- **Stalemate.** The player to move has no legal destination at all — every
  square their cards reach is dead or off the board. That player **loses**.

The result screen names the winner (“Blue Player wins” / “Red Player wins”),
states the reason (goal or no legal moves), and offers **Rematch** (same board,
same drafted cards, fresh pitch) and **New Game** (back to the start screen).

---

## 2. Movement cards

### 2.1 The draft

- Before kickoff, **6 cards** are drawn at random from the 12-card deck (§2.3)
  and laid face-up.
- **Player 1 picks 3.** Then **Player 2 picks 3** — from the same 6. The two
  players may pick overlapping cards; picks are independent, not a draft where
  the second player takes leftovers.
- Once both hands are locked in, the game starts.

### 2.2 How a card works

- A card is a set of **offsets** `[dx, dy]`, always written from **Player 1's
  perspective**: `+dx` is toward the opponent's goal (rightward), `+dy` is
  downward.
- **Player 2's offsets are mirrored horizontally**: `[dx, dy]` becomes
  `[-dx, dy]`. So "forward" always means "toward the other team's net" for
  whoever is holding the card, and the card art flips left-right when it is
  rendered in Player 2's hand.
- Every offset satisfies `max(|dx|, |dy|) ≤ 3` — nothing reaches more than 3
  nodes away in any direction, which is the "1, 2 or 3 points farther"
  constraint.
- **Cards are reusable.** A player may play the same card every single turn;
  cards are never spent, discarded or exchanged.
- A card is rendered as a **7 × 7 mini-grid** with the ball on the centre cell
  and the reachable offsets marked.

### 2.3 The deck (12 cards)

Offsets are `[dx, dy]` from Player 1's perspective. All cards are symmetric
top-to-bottom, so neither player has a vertical bias.

| # | Card | Offsets | Character |
|---|---|---|---|
| 1 | **Sprint** | `[1,0] [2,0] [3,0]` | Pure forward burst, no lateral escape |
| 2 | **Winger** | `[1,0] [2,-2] [2,2]` | Break wide, then in |
| 3 | **Lob** | `[-1,0] [2,-1] [2,1]` | Forward arcs plus one step back |
| 4 | **Sidestep** | `[1,-1] [1,1] [0,-2] [0,2]` | Lateral repositioning |
| 5 | **Backheel** | `[1,0] [-2,0] [-1,-1] [-1,1]` | Retreat and reset |
| 6 | **Volley** | `[3,0] [0,-3] [0,3]` | Maximum reach, only 3 directions |
| 7 | **Dribble** | `[1,-1] [1,0] [1,1] [0,-1] [0,1]` | Five short options — the escape card |
| 8 | **Cross** | `[2,0] [1,-3] [1,3]` | Far to the touchline |
| 9 | **Curl** | `[0,-1] [0,1] [3,-1] [3,1]` | Long curved runs plus a shuffle |
| 10 | **Bicycle** | `[2,-2] [2,2] [-2,-2] [-2,2]` | Diagonals only, both ways |
| 11 | **Through Ball** | `[-1,0] [2,0] [3,-2] [3,2]` | Deep, direct |
| 12 | **Pivot** | `[-1,-1] [-1,1] [1,-2] [1,2]` | Turn out of trouble |

---

## 3. Design

The design brief the implementation is built against. Treat these as the
project's visual contract.

### 3.1 Layout

Three stacked bands filling the viewport exactly — no page scroll, ever:

```
┌──────────────────────────────────────────────┐
│ HUD bar   turn pill · move count · ⟳ restart │  ~38px
├──────────────────────────────────────────────┤
│                                              │
│              THE PITCH (SVG)                 │  flex: 1
│                                              │
├──────────────────────────────────────────────┤
│   [card] [card] [card]   ← active hand only  │  ~76px
└──────────────────────────────────────────────┘
```

- The pitch is a single `<svg>` with a `viewBox` and
  `preserveAspectRatio="xMidYMid meet"`, so it scales to whatever the middle
  band gives it and never overflows.
- The **active player's three cards only** are shown in the bottom strip,
  tinted with that player's colour. The strip's background colour is the
  clearest signal of whose turn it is.
- Portrait orientation shows a full-screen **"Rotate your device"** overlay with
  a rotating-phone glyph; the game is not playable until the device is
  landscape.
- Zoom is off: `user-scalable=no, maximum-scale=1`, `touch-action: manipulation`
  on the body, `overscroll-behavior: none`, `-webkit-user-select: none`,
  `-webkit-tap-highlight-color: transparent`.

### 3.2 The ground

- Deep grass green with **alternating vertical mown stripes** — one stripe per
  board column, ~4% lighter/darker, giving the pitch its groundskeeper look.
- White pitch markings at ~55% opacity, drawn *under* the grid: outer boundary,
  halfway line, centre circle + centre spot, a penalty box and 6-yard box at
  each end, and four corner arcs.
- The **node lattice** sits on top: grid lines at ~18% white, 1px, and a small
  ~1.5px white dot at every node at ~30% opacity. Faint — legible, never loud.
- The pitch rectangle is inset from the SVG edge by half a cell so the outer
  nodes sit *on* the touchlines, and the goals have room to protrude.

### 3.3 The goals

- A real goal drawn outside each touchline: two posts, a crossbar, and a net of
  diagonal cross-hatch (`<pattern>`, white at ~25%), receding slightly for
  depth.
- The keeper sits on the goal node as a **circular jersey badge** — the player's
  colour, a white 1.5px ring, a soft drop shadow, and a bold white letter
  (`M` left, `S` right).
- When the ball enters a goal, the net **ripples**: the net pattern scales and
  settles over ~600ms while the goal flashes the scoring player's colour.

### 3.4 The ball

- A classic football: white sphere with a subtle radial gradient (light from
  top-left), a black pentagon at the centre and five surrounding hexagon seams,
  plus a soft elliptical shadow on the grass beneath it.
- **Movement animation** — the signature of the game:
  - Duration scales with distance: `180ms + 45ms × chebyshevDistance`,
    `cubic-bezier(.22,.61,.36,1)`.
  - The ball follows the straight line to its destination **plus a parabolic
    arc**: it lifts up to `0.35 × cellSize × distance` at the midpoint, and the
    shadow beneath it shrinks and fades as the ball rises, then snaps back.
  - It **spins** — `360° × distance` of rotation over the flight, direction
    following the sign of `dx`.
  - On landing: a 90ms squash-and-stretch (scale `1.18, 0.86` → `1, 1`) and a
    single expanding ring pulse on the grass in the mover's colour.
- The trail segment is drawn **in sync with the flight** using an animated
  `stroke-dashoffset`, so the line appears to be painted by the ball itself.

### 3.5 Trail, dead nodes, highlights

- **Trail lines**: 3px, round caps and joins, Player 1 blue / Player 2 red, at
  ~85% opacity, with a soft dark outer stroke underneath for contrast against
  the grass.
- **Dead nodes**: a 5px grey dot (`rgba(0,0,0,.38)`) with a thin white ring,
  drawn *under* the trail lines so the line reads as continuous. They fade in
  over 200ms as the ball leaves.
- **Highlights**: legal destinations get a pulsing ring in the active player's
  colour (1.6s ease-in-out, scale `1 → 1.15`, opacity `.9 → .45`) over a
  translucent filled disc. Tap target is ≥ 44px regardless of drawn size — an
  invisible hit circle sits over every node.
- Illegal nodes are never highlighted and never show an error state; they are
  simply inert.

### 3.6 Colour

| Token | Light | Dark |
|---|---|---|
| Player 1 (Blue) | `#2a6ff0` | `#5b9bff` |
| Player 2 (Red) | `#e0393e` | `#ff6b6f` |
| Grass | `#3f9a4e` | `#1f5a2c` |
| Grass stripe | `#378a45` | `#1b4f27` |
| Pitch markings | `rgba(255,255,255,.55)` | `rgba(255,255,255,.45)` |
| Grid lines | `rgba(255,255,255,.18)` | `rgba(255,255,255,.14)` |
| Page / chrome | `#f9f9f7` | `#0d0d0d` |
| Surface | `#fcfcfb` | `#1a1a19` |
| Ink | `#0b0b0b` | `#ffffff` |

Standard myflare conventions apply: `:root` custom properties,
`color-scheme: light dark`, a `@media (prefers-color-scheme: dark)` block
overriding the same variables, and the
`system-ui, -apple-system, "Segoe UI", sans-serif` font stack.

### 3.7 Screens

1. **Start** — title, board-size `<select>` (7 × 15 / 9 × 15), *Kick Off*
   button, and the running win tally.
2. **Draft** — the 6 drawn cards, large. Header says whose pick it is and how
   many remain (“Player 1 (M) — pick 3 · 2 left”). Selected cards lift and get a
   coloured border. Player 2's view renders the same cards mirrored.
3. **Game** — HUD, pitch, active hand.
4. **Result** — a translucent overlay over the finished pitch (the final trail
   stays visible behind it): winner name in their colour, the reason, *Rematch*
   and *New Game*.

### 3.8 Persistence

`localStorage` key **`paper-football`**, holding only:

```json
{ "size": "7x15", "wins": { "p1": 0, "p2": 0 } }
```

Board size is a preference restored on load; wins are a running tally shown on
the start screen. No game state is persisted — a refresh starts over.

---

## 4. Files

```
paper-football/
  README.md     ← this spec — read before every change
  index.html    ← all four screens + the pitch SVG shell
  styles.css    ← layout, pitch chrome, cards, overlays, dark mode
  cards.js      ← the 12-card deck + mini-grid card renderer
  board.js      ← SVG pitch/goal/lattice drawing, ball flight, trail, highlights
  game.js       ← state machine, legal-move generation, win detection, screens
```

Static only — no build step, no dependencies, no backend. Served as plain files
from GitHub Pages.

---

## 5. Possible enhancements

Not implemented; listed so future work has somewhere to start.

- **No-repeat cards** — forbid playing the same card twice in a row, which makes
  the draft far more tactical.
- **Onitama exchange** — after playing a card, hand it to the opponent.
- **Line crossing forbidden** — the classic paper-soccer rule that the ball's
  path may not cross an existing trail segment.
- **Bounce moves** — landing next to an existing trail grants a free extra move,
  as in the pen-and-paper original.
- **Undo** for the last move, and a move-list replay.
- **Single-player** opponent with a simple search over the legal-move tree.
- **Sound** — a synthesized kick, a net ripple, and a whistle at full time.
