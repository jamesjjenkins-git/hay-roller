# Farmyard Rally 🚜🌾

A cartoon farm game for phones (and desktop browsers). Race tractors, quads and motorbikes, earn
credits, upgrade, and race again. Credits are free in-game currency with no cash value.

![Farmyard Rally on an iPhone in landscape](docs/tractor-race.png)

## Games

### Farmyard Rally (main game)
A single-screen, top-down off-road race in the style of the classic arcade *Super Off Road*: four
racers on a dirt track ringed with hay bales and tyres, with jumps, mud, water splashes and
bumps.

- **Controls (phone):** hold the **◀ ▶ steering buttons** bottom-left to turn (tap to nudge, hold
  for a steady turn; rock your thumb between them without lifting). Prefer a slider? Switch from
  the pause menu: slide left or right anywhere on the left half to steer at a steady rate; hold
  still for a moment and it's just like lifting your thumb.
  Gas is automatic. **DRIFT** (hold to slide sideways — tighter turns that keep your speed, steer the other way to switch sides; you can drift a whole lap), **NITRO** and **BRAKE** (hold to reverse) sit bottom-right. Keyboard: Shift or X to drift. Play in landscape.
- **Hills** like Super Off Road: climbing costs speed, the way down gives it back (and a bit more), and cresting a hill at speed throws you into the air — further on quads and motorbikes. Climbs are lit and descents shaded, with contour lines, and vehicles grow slightly as they get higher. Found on the long straights of Cornfield Chase, Orchard Run and most of the Back Forty pack.
- **🏜️ Back Forty pack**: eight extra tracks (Hoedown Hollow, Rattlesnake Ridge, Mudslide Mesa, Big Barn Bluff, Thunder Quarry, Clifftop Farm, Egg Basket Basin, Twister Gulch). Each has its own terrain — raised straights, ridges, a high rim, a sunken pit — so the road climbs and drops with the ground, and the stretches that cross meet at the same height. Opens after a top 3 at the Harvest Grand Prix; pick it with the pack switcher above the track list.
- **Three race series**: 🚜 **Tractor Cup** → 🏁 **Quad Cup** → 🏍️ **Motorbike Cup**. Each runs the same 11 tracks against rivals on the same vehicle, with its own upgrades (2× and 3.5× the price) and bigger prizes (1.6× and 2.4×). Finish top 3 at the Harvest Grand Prix to unlock the next series. Quads are 25% faster, twitchy and slidey with bigger drifts; motorbikes are 50% faster, lean hard into turns and get knocked about more by walls and animals.
- **🎈 Farmyard Frenzy bonus round** after every race: just you, 100 escaped animals and one minute. They pop like balloons when you hit them (and scatter when you bear down on them). Every 5 popped pays 5% of that track's winning prize (🌾15 per 5 on Muddy Meadow up to 🌾75 per 5 on the bonus track), so popping all 100 is worth a race win, plus a 25% clean-sweep bonus. Best score per track is remembered.
- **Two camera views**, switchable any time with the 📷 camera button at the top of the race screen, the **V**
  key, or the pause menu (the choice is remembered):
  - **Whole track** — the classic single-screen *Super Off Road* view.
  - **Close-up** — a *Micro Machines*-style camera that follows you with a little
    look-ahead and fills the whole screen, with edge arrows pointing to off-screen rivals and a
    minimap of the track.
- **Controls (keyboard):** ← → steer, ↓ brake/reverse, Space nitro, Esc pause.
- **Pause → Controls** explains the controls for the device you're playing on (phone or
  keyboard), with a link to the other set.
- **Cash bags and nitro cans** pop up on the track. Grab them before your rivals do.
- **Prizes:** credits for your finishing place plus any cash bags you grabbed.
- **The garage:** spend credits on four upgrades, 5 levels each, and choose a paint job:
  - **Acceleration** — get up to speed faster
  - **Top Speed** — go faster flat out
  - **Handling** — tighter turns and more grip
  - **Boosts** — one more nitro per race
- **Fair rivals:** on the first track rivals run at about 91% of a stock vehicle's pace
  (they drive cleaner lines than a thumb can), rising to full pace by the Grand Prix. A little
  **rubber banding** helps only the player: fall more than ~140px behind the rival directly
  ahead and you get up to +16% speed, fading out as you close back up behind it. It never
  helps you pass anyone.
- **Ten tracks**, unlocked in order by finishing 3rd or better on the one before: Muddy Meadow,
  Barnyard Bend, Pig Pen Pass, Duck Pond Dash, Cornfield Chase, Sheep Dip Slalom, Haystack Hill,
  Windmill Way, Orchard Run and the Harvest Grand Prix. Rivals get faster and prizes get bigger
  (300 → 1,400 credits for a win) as you go, and rivals also scale a little with your upgrades.
- **Bonus track 11: Figure-8 Frenzy** — a figure of eight with a real crossroads in the middle
  where racers cross paths (and can T-bone each other). Unlocks after a top-3 finish at the
  Harvest Grand Prix.
- **Unlock all tracks (testing):** with `?dev` in the address, a switch under the track list in
  the garage opens every track regardless of results. It's hidden in normal play and in the app.

- **Awards:** finish 1st, 2nd or 3rd for a 🥇🥈🥉 trophy on that track. Set the quickest lap of
  the race for the ⏱️ **Fastest Lap** award and a bonus (a tenth of the track's winning prize).
  Personal-best laps are recorded per track, and the HUD shows your current and best lap. Tap
  the 🏆 counter in the garage to open the **Trophy Cabinet**: totals plus, for every track, your
  best finish, trophy counts, fastest-lap awards and best lap.

- **Drifting:** a live counter over your vehicle shows how long the current slide has lasted,
  with a callout when it ends (and BEST! for the longest of the race). Only drifting through
  turns counts: holding DRIFT down a straight doesn't, and hitting a wall ends a slide. Drift
  through turns for 12, 24 or 36 seconds in a race for a **drift bonus** of 5%, 10% or 20% of
  the track's winning prize, shown on the results screen with the next target. The Trophy
  Cabinet keeps your lifetime drift time and longest slide.
- **Badges:** 19 challenges, each with 🥉 bronze, 🥈 silver and 🥇 gold tiers (100, 250 and
  600 Hay when reached): On a Roll (wins in a row), Didn't Touch the Sides (no wall hits),
  Clean Driver (no mud or water), Animal Lover (no animals hit), Money Bags (cash bags in a
  race), Speedy (nitros in a race), Lights to Flag (lead every lap and win), Comeback Kid (win
  from last), Drift King (drift kicks in a race), Long Slide (longest unbroken drift), Sideways (drift time in
  a race), Frequent Flyer (jumps in a race), Lap Record,
  Pest Control and Quick Pop (Farmyard Frenzy), Farm Champion and Back Forty (wins on different
  tracks), All-Rounder (wins in each vehicle) and Regular (days raced). New tiers show on the
  results screen; the Trophy Cabinet shows every badge with progress to its next tier. Targets
  are in `js/tractor/badges.js`.

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

## Currencies, ads and the store

The decisions behind this (and what we chose not to do) are in [docs/monetisation.md](docs/monetisation.md).

- **🌾 Hay** — the game currency, shared by every game. **Hay is never sold.** You get it from a
  500 welcome gift, a 200 daily bonus (resets at local midnight), opt-in reward ads (150 each,
  up to 10 a day), and winnings. After a race with prize money you can watch an ad to double it.
- **🪙 Gold** — bought with real money (100 for 99p, 500 for £2.99, 1,000 for £4.99) and spent in
  the garage: premium paints, decals, hats and trails, plus optional shortcuts (any upgrade level
  for a tenth of its Hay price, and spare nitros for one extra boost in a race). Gold can't be bet
  or turned into Hay, which keeps real money away from the casino-style games.
- **Remove ads** — a one-off purchase that hides the home page banner. Reward ads stay
  available because they're always the player's choice.
- **Ads:** one banner pinned to the bottom of the **home page only** — never in a game, the
  garage or a race — and opt-in reward videos that pay only if watched to the end.

Everything runs behind adapters so going live doesn't touch game code:
- `js/monetize/ads.js` — `FarmAds.setProvider({ showBanner, hideBanner, showRewarded })`. In a
  browser the built-in provider shows labelled placeholders (a house-ad banner and a 5-second
  "ad" with a Close-without-reward button). In the iPhone app `js/monetize/admob.js` swaps in
  Google AdMob (`@capacitor-community/admob`): consent form, App Tracking Transparency prompt,
  a native home banner and rewarded videos. It serves Google **test ads** until
  `js/monetize/ad-config.js` is switched live (see *Real ads* below).
- `js/monetize/store.js` — purchases go through a `billing` adapter. In a browser that's **test
  mode**: it asks for confirmation and grants the item without taking money (clearly labelled
  in the wallet). In the iPhone app it's Apple in-app purchase (`js/monetize/iap.js` over the
  app's own StoreKit 2 plugin in `plugins/farm-store`), with App Store prices and a Restore
  purchases button; see *In-app purchases* below.
- `js/monetize/rewards.js` — welcome, daily and ad-reward rules and caps.

For testing, add `?dev` to the URL to show a developer Hay top-up in the wallet.

## Wallet
Click the 🌾 pill in the top bar for free Hay (daily bonus, reward ads) and recent activity, or
the 🪙 pill to jump to the Gold store. Balances, purchases and history are stored in
`localStorage` in your browser.

Bets are taken from the wallet when the race starts. If you leave the page or reload mid-race, the
race is replayed from its seed and settled, so a bet is never lost or left hanging.

## Playing on your phone (GitHub Pages)
`.github/workflows/pages.yml` publishes the game on every push (after the tests pass) to
**https://jamesjjenkins-git.github.io/hay-roller/**. One-off setup:
1. The repo must be public on a free GitHub plan (Settings → General → Danger Zone → Change
   visibility), or you need GitHub Pro for Pages on a private repo.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Actions tab → *Deploy to GitHub Pages* → **Run workflow** (or just push).

Then on the iPhone open the link in Safari → Share → **Add to Home Screen**.

**Updates:** each deploy stamps a build id onto every script/stylesheet URL (so phones never
mix old cached files with new ones) and writes `version.json`. The app checks it when opened or
brought back to the foreground; if a newer build is live it shows *"New version available — tap
to update"* (never during a race). The home page footer shows the running version and has a
**Check for updates** link.

## Running it
No build step and no dependencies. Either open `index.html` directly in a browser, or serve the
folder:

```sh
npm start        # serves on http://localhost:8080
```

## iPhone app
`ios/` is an Xcode project (Capacitor) that wraps the same game. After changing the web code:

```sh
npm install      # once
npm run ios      # copies the game into www/ and syncs it into ios/
npm run ios:open # opens Xcode
```

- **On your own iPhone, free account:** Xcode → Settings → Accounts, add your Apple ID. Then
  App target → Signing & Capabilities → Team: *(your name) (Personal Team)*. Plug the phone in,
  pick it as the run destination and press Run. Turn on Developer Mode on the phone when asked
  (Settings → Privacy & Security), and trust the developer under Settings → General → VPN &
  Device Management. Free-account installs expire after 7 days; press Run again to renew.
- **TestFlight** needs the paid Apple Developer Program (£79/year). Once you've joined:
  1. Xcode → Settings → Accounts: your Apple ID now shows the paid team. In the App target →
     Signing & Capabilities, pick that team (not the "(Personal Team)").
  2. [App Store Connect](https://appstoreconnect.apple.com) → Apps → **+** → New App: iOS, name
     *Farmyard Rally*, bundle id `com.jamesjenkins.farmyardrally`, any SKU. (If the bundle id is
     taken, change it in Xcode and here.)
  3. `npm run testflight` builds the game, archives it with the next build number (the commit
     count) and uploads it. It appears under **TestFlight** once Apple has processed it.
  4. In TestFlight, add yourself as an internal tester (no review needed) and install with the
     TestFlight app. External testers need a one-off beta review.

### In-app purchases (Gold and Remove ads)
The app sells the three Gold packs and Remove ads through Apple in-app purchase. The App Store
product ids are fixed in `js/monetize/iap.js` (Apple never lets an id be reused):

| Product | App Store id | Type |
| --- | --- | --- |
| Pocket of Gold (100) | `com.jamesjenkins.farmyardrally.gold.small` | Consumable |
| Pail of Gold (500) | `com.jamesjenkins.farmyardrally.gold.medium` | Consumable |
| Barrow of Gold (1,000) | `com.jamesjenkins.farmyardrally.gold.large` | Consumable |
| Remove ads | `com.jamesjenkins.farmyardrally.removeads` | Non-consumable |

**Testing now, no paid account needed:** run the app from Xcode. The shared *App* scheme uses
`ios/App/App/Products.storekit` (Product → Scheme → Edit Scheme → Run → Options → StoreKit
Configuration), so purchases go through Xcode's local StoreKit test store: no money, no App
Store Connect. Debug → StoreKit → Manage Transactions lets you refund, approve Ask to Buy, or
clear purchases to test again.

**Selling for real** (needs the paid Apple Developer Program):
1. App Store Connect → Business: accept the **Paid Apps agreement** and add banking and tax.
2. Create the app with bundle id `com.jamesjenkins.farmyardrally`, then the four products
   above with **exactly those ids**, their prices, names and a review screenshot each.
3. Users and Access → Sandbox: add a **sandbox tester** to try real-flow purchases on TestFlight.
4. Submit the products together with the first app version (first-time products are reviewed
   with the app).

### Real ads (AdMob)
The app already shows Google's test ads (banner on the home page, rewarded videos in the wallet
and after races). To earn from real ones:

1. Sign up at [admob.google.com](https://admob.google.com) (free) and add your payment details.
2. Apps → Add app → iOS → "not listed on a store yet". Note the **app id**
   (`ca-app-pub-…~…`) and create two ad units: **Banner** and **Rewarded**.
3. Put the app id in `ios/App/App/Info.plist` (`GADApplicationIdentifier`), the two ad unit ids
   in `js/monetize/ad-config.js`, and set `live: true`. Then `npm run ios`.
4. Privacy & messaging in AdMob: create a **GDPR message** (UK/EEA consent form) and an **IDFA
   explainer**; the app shows them through Google's consent SDK.
5. Never tap your own live ads. Run the app once, copy the test device id that Xcode's console
   prints, and add it to `testDevices` in `ad-config.js`.
6. Once the app is on the App Store, link it in AdMob and publish an `app-ads.txt` on the
   developer website in its listing. Until then AdMob serves only limited ads, so real revenue
   starts with the App Store release (which needs the paid Apple Developer Program).

## Tests
```sh
npm run shots    # screenshot every track into screenshots/ (first time: npm run shots:setup)
npm test         # Node 20+; covers the wallet, rewards, store, all three credit games and Farmyard Rally
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
| `js/monetize/rewards.js` | Welcome gift, daily bonus, reward-ad payouts and daily cap |
| `js/monetize/store.js` | Gold packs and Remove ads; billing adapter (test mode in a browser) |
| `js/monetize/iap.js`, `plugins/farm-store/` | Apple in-app purchase: billing adapter and the app's StoreKit 2 plugin |
| `js/monetize/ads.js` | Home banner and reward-video adapter with placeholder provider |
| `js/monetize/admob.js`, `js/monetize/ad-config.js` | AdMob provider for the iPhone app; ad ids and the live switch |
| `js/pending.js` | Saves mini-game payouts until they're credited (crash-safe) |
| `js/slots/slots-logic.js`, `js/slots/slots.js` | Piggy Bank Slots: reels, paytable, RTP maths; UI |
| `js/eggs/egg-logic.js`, `js/eggs/egg-roulette.js` | Egg Roulette: bets and payouts; hen animation and board |
| `js/tractor/tracks.js` | Track shapes (smoothed centre lines), features, geometry helpers |
| `js/tractor/sim.js` | Tractor physics, walls, jumps, surfaces, pickups, AI drivers, laps, prizes |
| `js/tractor/garage.js` | Upgrades, costs, paint, track unlocks — saved in localStorage |
| `js/tractor/render.js` | Canvas renderer for the race (tracks, tractors, tyre marks, particles) |
| `js/tractor/game.js` | Garage screen, race loop, touch joystick/buttons, HUD and results |
| `manifest.webmanifest`, `icons/` | Home-screen install (full screen, landscape) |
