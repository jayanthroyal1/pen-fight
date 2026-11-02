# Pen Fight

The classroom desk game in the browser: flick your pen, knock the other pen off the desk.
Pens are 3D bodies simulated with [Rapier](https://rapier.rs) and drawn with three.js.

- **Play the computer**, **a friend on the same device**, or **online** with a room code.
- **Five pens**, each with a different hit power. A stronger pen is heavier and flicks harder, so it shoves
  the other pen further and is harder to knock off:

  | Pen | Power |
  | --- | --- |
  | ₹3 Ballpoint | Least power |
  | Reynolds Gel Racer | Below medium |
  | Cello Pointec | Medium |
  | Add Gel | Powerful |
  | Retro 51 Tornado | Most powerful |

- **Sounds** are synthesised with Web Audio: the finger flick, pens clacking (metal pens ring), taps on the
  desk, the scrape of a sliding pen, the clatter when a pen falls off, and the whole class clapping when
  someone wins a round (a bigger ovation for the match).
- **Every match is recorded**: each flick, the pens' 3D movement through the shot (20 frames a second),
  every impact, and how the shot ended.

## Run it

```bash
npm install
npm run dev        # the game, http://localhost:5173
npm run server     # the online relay, ws://localhost:8787 (only needed for online play)
npm test
npm run build
```

The game looks for the relay on the same host at port 8787. Set `VITE_SERVER_URL` (for example
`wss://relay.example.com`) when the relay runs elsewhere.

## How it plays

Press on your pen, pull back like a slingshot and let go. A dashed line shows the direction; it turns
red when you've stretched as far as it goes. Your power isn't shown, so judge the pull yourself. Where
you press matters: near the tip spins the pen, the middle sends it straight. Knock the other pen off the desk to win the round; slide off
yourself and you lose it (also when you take the other pen with you). First to 3 rounds wins. The
player who lost a round shoots first in the next.

## Code map

| Path | What it is |
| --- | --- |
| `src/game/world.ts` | Rapier world: desk slab, pen bodies, flicks, impacts, when a shot is over |
| `src/game/physics.ts` | Desk geometry shared by input and drawing |
| `src/game/aiming.ts` | Turning a pull on screen into a flick, and easing the shown aim |
| `src/game/pens.ts` | The five pen models: power, mass, looks |
| `src/game/rules.ts` | Turns, rounds, scoring |
| `src/game/ai.ts` | Computer player: simulates many flicks in Rapier and keeps the best |
| `src/game/scene3d.ts` | three.js classroom: worn desk, pens, aim line, flicking finger, camera fit |
| `src/audio/sounds.ts`, `src/audio/applause.ts` | Synthesised sounds and crowd applause |
| `src/recording/` | Match recorder and stores |
| `src/net/`, `server/index.js` | Online play: a relay that pairs two players by room code |

### Online play

The relay only pairs players and forwards messages. Both browsers simulate each shot. The shooter's
browser decides how it ended and sends the settled state (`sync`), which the other browser adopts, so
the two desks always agree.

### Recordings and Supabase

Recordings go through the async `MatchStore` interface in `src/recording/store.ts`. Today the store is
`LocalMatchStore` (browser localStorage, newest 30 matches kept). To move to Supabase, write a
`SupabaseMatchStore` that implements `save`, `get` and `list` (for example a `matches` table with an
`id uuid` key and a `record jsonb` column) and install it at startup with `setMatchStore(...)`. Nothing
in the game needs to change. The record format is `MatchRecord` in `src/recording/types.ts`.
