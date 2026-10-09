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
- **Cash bags and nitro cans** pop up on the track. Grab them before the other tractors do.
- **Prizes:** credits for your finishing place plus any cash bags you grabbed.
- **The garage:** spend credits on four upgrades, 5 levels each, and choose a paint job:
  - **Acceleration** — get up to speed faster
  - **Top Speed** — go faster flat out
  - **Handling** — tighter turns and more grip
  - **Boosts** — one more nitro per race
- **Three tracks:** Muddy Meadow, Barnyard Bend and Pig Pen Pass. Finish 3rd or better to unlock
  the next one. Rival tractors get tougher on later tracks and as you upgrade.

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

### Coming soon
Piggy Bank Slots and Egg Roulette (placeholders in the lobby).

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
npm test         # Node 20+; covers the wallet, Hay Bale Derby and Tractor Rally
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
| `js/tractor/tracks.js` | Track shapes (smoothed centre lines), features, geometry helpers |
| `js/tractor/sim.js` | Tractor physics, walls, jumps, surfaces, pickups, AI drivers, laps, prizes |
| `js/tractor/garage.js` | Upgrades, costs, paint, track unlocks — saved in localStorage |
| `js/tractor/render.js` | Canvas renderer for the race (tracks, tractors, tyre marks, particles) |
| `js/tractor/game.js` | Garage screen, race loop, touch joystick/buttons, HUD and results |
| `manifest.webmanifest`, `icons/` | Home-screen install (full screen, landscape) |
