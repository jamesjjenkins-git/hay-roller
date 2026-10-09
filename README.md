# Farmyard Rally 🚜🌾

A cartoon farm game for phones (and desktop browsers). Race your tractor, earn credits, upgrade
it, and race again. Credits are free in-game currency with no cash value.

![Tractor Rally on an iPhone in landscape](docs/tractor-race.png)

## Games

### Tractor Rally (main game)
A single-screen, top-down off-road race in the style of the classic arcade *Super Off Road*: four
tractors on a dirt track ringed with hay bales and tyres, with jumps, mud, water splashes and
bumps.

- **Controls (phone):** drag anywhere on the left half of the screen to steer — point the stick
  where you want to go and the tractor turns to face it. Gas is automatic. **NITRO** and
  **BRAKE** (hold to reverse) sit bottom-right. Play in landscape.
- **Controls (keyboard):** ← → steer, ↓ brake/reverse, Space nitro, Esc pause.
- **Pause → Controls** explains the controls for the device you're playing on (phone or
  keyboard), with a link to the other set.
- **Cash bags and nitro cans** pop up on the track. Grab them before the other tractors do.
- **Prizes:** credits for your finishing place plus any cash bags you grabbed.
- **The garage:** spend credits on four upgrades, 5 levels each, and choose a paint job:
  - **Acceleration** — get up to speed faster
  - **Top Speed** — go faster flat out
  - **Handling** — tighter turns and more grip
  - **Boosts** — one more nitro per race
- **Ten tracks**, unlocked in order by finishing 3rd or better on the one before: Muddy Meadow,
  Barnyard Bend, Pig Pen Pass, Duck Pond Dash, Cornfield Chase, Sheep Dip Slalom, Haystack Hill,
  Windmill Way, Orchard Run and the Harvest Grand Prix. Rivals get faster and prizes get bigger
  (300 → 1,400 credits for a win) as you go, and rivals also scale a little with your upgrades.

- **Awards:** finish 1st, 2nd or 3rd for a 🥇🥈🥉 trophy on that track. Set the quickest lap of
  the race for the ⏱️ **Fastest Lap** award and a bonus (a tenth of the track's winning prize).
  Personal-best laps are recorded per track, and the HUD shows your current and best lap. Tap
  the 🏆 counter in the garage to open the **Trophy Cabinet**: totals plus, for every track, your
  best finish, trophy counts, fastest-lap awards and best lap.

### Install on an iPhone
Open the page in Safari, tap **Share → Add to Home Screen**. It then launches full screen in
landscape like an app, with its own icon. (A native App Store build would mean wrapping this web
app with something like Capacitor; that's a later step.)

### Hay Bale Derby (earn credits)
Six round hay bales roll down a hillside, seen from above. Back the bale you think will cross the
finish line first. Chickens, ducks, sheep, pigs and cows wander across the course at random and
bounce, slow down or divert any bale that hits them — the heavier the animal, the bigger the knock.

- **Odds** are priced fresh for every race by simulating the field 300 times (Monte Carlo) and
  applying a 10% house edge, so every bale returns roughly 90% on average. Odds range from ~1.5× to 60×.
- **Bale stats** (Speed, Kick, Steady) are shown on each card and genuinely drive the physics.
- The live race uses a seed drawn only when you press *Roll 'em!*, so the outcome can't be known
  while betting.
- Bets are win-only: payout = stake × odds, rounded down.

![Race results](docs/results-screenshot.png)

### Piggy Bank Slots (earn credits)
Three reels, one payline. 🐷 is wild. Three truffles pay 300×, three pigs 120×, eggs 40×,
apples 16×, corn 8×, carrots 4×, and any two carrots 2×. The paytable is tuned by exact
enumeration of every reel position: about 92% return, with a win on roughly 1 spin in 4.
Bets 5–100; Space spins on a keyboard.

### Egg Roulette (earn credits)
A hen runs round 13 nests (golden 0 plus 1–12, brown or white) and lays an egg in one. Bet on a
single nest (12×), a coop of four (3×), or brown/white, odd/even, 1–6/7–12 (2×). Every bet
returns 12/13 ≈ 92.3%. Bets stay on the board between rounds, with Undo and Clear.

Both mini games decide the result before the animation and save any payout first, so closing
the page mid-spin or mid-run still pays out the next time you open the game.

## Wallet
One wallet is shared by every game: win credits racing or at the Derby, spend them in the garage.
Click the credits pill in the top bar to add free credits (preset packs or a custom amount up to
100,000), see recent activity and reset the wallet. The balance and history are stored in
`localStorage` in your browser.

Bets are taken from the wallet when the race starts. If you leave the page or reload mid-race, the
race is replayed from its seed and settled, so a bet is never lost or left hanging.

## Running it
No build step and no dependencies. Either open `index.html` directly in a browser, or serve the
folder:

```sh
npm start        # serves on http://localhost:8080
```

## Tests
```sh
npm test         # Node 20+; covers the wallet, all three credit games and Tractor Rally
```

## Code layout
| File | Purpose |
| --- | --- |
| `js/wallet.js` | Play-money wallet (deposit / spend / credit / history), persisted to localStorage |
| `js/rng.js` | Seeded PRNG so races are reproducible |
| `js/race-sim.js` | Pure, deterministic race physics, animal AI, collisions, odds and payouts |
| `js/race-render.js` | Canvas renderer: farm scenery, bales, animals, particles |
| `js/hay-derby.js` | Betting flow, race loop, results, crash recovery |
| `js/sound.js` | Synthesized sound effects (WebAudio) |
| `js/app.js` | Lobby, wallet modal, routing |
| `js/pending.js` | Saves mini-game payouts until they're credited (crash-safe) |
| `js/slots/slots-logic.js`, `js/slots/slots.js` | Piggy Bank Slots: reels, paytable, RTP maths; UI |
| `js/eggs/egg-logic.js`, `js/eggs/egg-roulette.js` | Egg Roulette: bets and payouts; hen animation and board |
| `js/tractor/tracks.js` | Track shapes (smoothed centre lines), features, geometry helpers |
| `js/tractor/sim.js` | Tractor physics, walls, jumps, surfaces, pickups, AI drivers, laps, prizes |
| `js/tractor/garage.js` | Upgrades, costs, paint, track unlocks — saved in localStorage |
| `js/tractor/render.js` | Canvas renderer for the race (tracks, tractors, tyre marks, particles) |
| `js/tractor/game.js` | Garage screen, race loop, touch joystick/buttons, HUD and results |
| `manifest.webmanifest`, `icons/` | Home-screen install (full screen, landscape) |
