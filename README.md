# WildPlayers

A gaming platform for the browser, built phone-first. It opens with a 10-second film (`public/brand/`: a wide
cut, and a portrait cut for tall screens that keeps the whole logo in view), then the landing page: a
featured game and tiles for each genre (Action, Adventure, Office, Simulation, Puzzle, Online). The film plays as
the site opens and ends on "Tap to start". Browsers refuse sound before a tap, so it may start silent, with a
Sound on button.

Games: Wolf Run (Action), an endless one-tap runner whose rules are in `src/runnerGame/sim.ts` (how the wolf
moves on screen is in `src/runnerGame/rig.ts` and never changes the game), with a shared
top-scores table (run `supabase/wolf_run_scores.sql` once in the Supabase SQL Editor to switch it on); Pen Fight
(Action, Online); and Guess the Movie Title (Friday Fun, inside Office), a picture puzzle where three or
more small pictures point to a Telugu movie and the player picks its title. It has six levels of ten movies
from 2005 onwards, each harder than the last, with levels 7 to 10 shown as upcoming. Movies are in
`src/movieGame/movies.ts` and the levels in `src/movieGame/game.ts`; Hindi, Tamil and English are listed as
coming soon until they have movie lists.
Stick Man Sword Fight (Adventure, in beta) is a story of eight connected duels, each harder than the last:
the rules and the computer's fighting are in `src/swordGame/combat.ts`, the story in `story.ts`, Rapier
physics and ragdolls in `world.ts`, and Three.js in `scene.ts`. On a phone it plays sideways.
Doodle Rush (Online, Puzzle, and Friday Fun in Office) is a draw-and-guess game for 2 to 8 players in online
rooms: `src/drawGame/rules.ts` holds the rules, and the room's first player runs them for everyone over
Supabase Realtime, passing the job on if they leave. The host picks the rounds and drawing time in the lobby.
It needs the same Supabase settings as online Pen Fight.

- `src/platform/` is the shell: `catalog.ts` lists genres and games (add a game here), `stage.ts` is the
  3D background, `Intro.tsx`, `Pages.tsx` and `Platform.tsx` are the screens, using Motion for animation.
- Only the shell loads first. A game is its own download, fetched in the background once the landing page
  is up, and the 3D background is freed before a game starts.
- Full screen: on Android the first tap hides the browser's bars, with a switch in the header. iPhones don't
  allow that, so a welcome screen offers Add to Home Screen before the intro. Installed, it opens with no bars
  on any phone, shows a splash screen instead, and never offers it again on that device. iPhone launch images
  are in `public/brand/splash/`. The logo stays hidden until the intro film reveals it, and Tap to start always
  draws its own logo, so it can't land on a dark film frame.
- It adapts: phones get fewer points and a capped frame rate, and it lowers its resolution if frames run
  slow. With reduced motion or Data Saver there is no film and no 3D, and without WebGL no 3D: the same pages
  run on a plain background. `?stage=off` shows that version.

# Pen Fight

The first game on the platform. The classroom desk game in the browser: flick your pen, knock the other pen off the desk, and win
your friend's pen. Pens are 3D bodies simulated with [Rapier](https://rapier.rs) and drawn with three.js
in a classroom you can almost hear.

## What's in it

- **Your pencil box.** Every player starts with ₹200 and three random pens (no two players on a phone
  start with the same set). A pencil box holds 5 pens. Broke players get ₹50 pocket money once a day,
  and a free pen if they have none.
- **Bet rooms.** Each match is best of three for a bet; the winner takes both bets and the loser's pen,
  hero power and all. Each room is a different school with its own look:

  | Bet | Room | Pens allowed |
  | --- | --- | --- |
  | ₹25 | Government School | Level 1+ |
  | ₹50 | Private School | Level 2+ |
  | ₹75 | CBSE School | Level 3+ |
  | ₹100 | International School | Level 4+ |

- **Winning a full pencil box.** The winner chooses: swap the prize for one of their pens, break it
  (with the winner's hero finisher), or give it back.
- **Pen store.** 20 pens in five levels (₹50 to ₹1,500), including pink and rose pens, and seven hero
  powers. A power goes on one pen: it re-skins it, gives it an entrance, flick and strike style, a
  finisher for breaking pens, and +10% power. The heroes are original look-alikes (Green Giant, Web
  Flicker, Steel Comet, Night Wing, Amazon Lasso, Chakra Spin) plus Hanuman Gada, which turns the pen
  into a golden mace.
- **Super powers.** Each player's lightning button floats their powers up; picking one closes the list.
  On your turn, use one for your shot; while the other player aims, use one against their shot (one each
  a shot; tap again to take it back). On one phone, player 2's button sits in the opposite corner, turned
  to face them. Every player gets one use free each match, and more can be bought in the
  store (₹25 to ₹100, one use each):

  | Power | Price | What it does |
  | --- | --- | --- |
  | Lightning Bolt | ₹25 | Your shot: when your pen touches theirs, lightning strikes it away |
  | Health Boost | ₹30 | Any time: if your pen falls off this round, it comes back once |
  | Super Grip | ₹35 | Their shot: your pen grips the desk and turns heavy |
  | Ice Desk | ₹45 | Their shot: the desk freezes, so everything slides |
  | Power Strike | ₹50 | Your shot: the flick hits half as hard again |
  | Uneven Desk | ₹60 | Their shot: the desk tips down towards their end |
  | Force Wall | ₹75 | Their shot: glowing walls round your half of the desk |
  | Double Turn | ₹100 | Your shot: shoot again straight after |

  Practice games also let you try each one once a match, and the computer uses a few too.
- **Ways to play.** Online for rupees (quick match, invite link or room code), two players on one
  phone (each with their own profile and bets), or practice against the computer at Easy, Medium or
  Hard (no money or pens change hands).
- **Sound.** Synthesised with Web Audio: flicks, clacks, desk taps, falls, hero sounds, pens snapping,
  class applause, and classroom chatter with its own volume slider.
- **Every match is recorded**: each flick, the pens' 3D movement, every impact and each shot's result.

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
you press matters: near the tip spins the pen, the middle sends it straight.

Knock the other pen off the desk to win the round; slide off yourself and you lose it. If both pens go
off in the same shot, the round is a draw. Two round wins take the match; at one each the next round
is the final round. The round's loser shoots first in the next.

## Classroom chatter

The classroom noise is the recording in `public/audio/class.mp3`, looped in every room. To give a room
its own sound, add `class-public.mp3`, `class-private.mp3`, `class-cbse.mp3` or
`class-international.mp3` there; it's picked up automatically.

## Code map

| Path | What it is |
| --- | --- |
| `src/game/world.ts` | Rapier world: desk slab, pen bodies, flicks, impacts, when a shot is over |
| `src/game/physics.ts` | Desk geometry shared by input and drawing |
| `src/game/aiming.ts` | Turning a pull on screen into a flick, and easing the shown aim |
| `src/game/pens.ts`, `powers.ts`, `boosts.ts`, `rooms.ts` | The pen catalog, hero powers, super powers and bet rooms |
| `src/game/rules.ts` | Turns, best of three, draws |
| `src/game/ai.ts` | Computer player and its difficulty levels |
| `src/game/scene3d.ts` | The 3D view: camera, aim, finger, entrances, strikes, breaking a pen |
| `src/game/penMesh.ts`, `classroom.ts`, `fx.ts`, `boostFx.ts` | Pen models, classroom rooms and chalk score, effects, super power effects |
| `src/profile/` | Players, wallet and pencil box rules, and where profiles are stored |
| `src/audio/` | Synthesised sounds, applause and the classroom recording |
| `src/recording/` | Match recorder and stores |
| `src/net/`, `server/` | Online play: a relay that pairs players in a bet room |

### Online play

Under **Play online**, pick a bet room and a pen, then:

- **Find an opponent**: quick match with the next player looking in the same room.
- **Create room**: gives an invite link (`…/?room=SRTF&bet=public`) to share or copy. Opening it takes
  your friend to the pen picker and then straight into your room.
- **Got a code?**: type the 4-letter room code instead of using the link.

Online play needs a way for the two browsers to talk. Either:

- **Supabase Realtime** (recommended, no server of our own): set `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (Project Settings → API; the publishable/anon key, never the secret key) in
  `.env` and in your host, e.g. Vercel. Rooms are Realtime channels: presence says who's in a room and
  broadcasts carry the moves. No database tables are needed. See `src/net/realtimeLink.ts`.
- **The relay** in `server/`: deploy it to a Node host that keeps connections open and set
  `VITE_SERVER_URL`. It's used whenever the Supabase values aren't set.

Either way, only pairing and forwarding happen in the middle. Both browsers simulate each shot; the shooter's
browser decides how it ended and sends the settled state, which the other adopts. At the end the
winner's choice about the loser's pen is relayed, and each browser updates its own player's wallet.

### Storage and Supabase

Profiles (wallet and pencil box) go through the async `ProfileStore` in `src/profile/store.ts`, and
match recordings through `MatchStore` in `src/recording/store.ts`. Both use the browser's localStorage
today. Because each browser settles its own wallet, online bets can be cheated by editing storage until
a server keeps the wallets: write Supabase versions of both stores, install them with
`setProfileStore(...)` and `setMatchStore(...)`, and settle bets on the server. Nothing in the game needs
to change.
