# Monetisation decisions

What we decided about ads, purchases and the in-game economy, and why. The
README describes how it works; this records the choices behind it so they
don't get re-argued (or quietly undone).

## Principles

- **Hay is earned, never sold.** Hay is the play-money that the credit games
  (Hay Bale Derby, Piggy Bank Slots, Egg Roulette) and Tractor Rally use. It
  has no cash value and can't be bought, sold or withdrawn. Keeping real money
  out of the betting loop keeps the casino mini-games on the right side of
  app-store gambling rules ("simulated gambling" with no purchasable currency)
  and keeps the game fair.
- **Gold is the only thing you buy, and it's cosmetic.** Gold buys premium
  paint jobs only. It never buys Hay, upgrades, track unlocks or anything that
  makes you faster. No pay-to-win.
- **Ads are minimal and never interrupt play.**

## Ads

- **One banner, home page only.** A single banner along the bottom of the home
  page. Never in a game, the garage, a race, the results screen or the wallet.
  The user asked for exactly this ("only a banner across the bottom of the
  homepage, nowhere else").
- **Opt-in reward videos.** The player chooses to watch; they're paid only if
  they watch to the end. Offered in the wallet (free Hay), and after a race or
  Farmyard Frenzy round with prize money ("watch an ad to double it").
  - 150 Hay per wallet ad; the double-up pays the race's total again.
  - Capped at 10 reward ads a day (shared across all placements).
- **No interstitials** (no ads between races or on app open), and no
  auto-playing video.
- **Remove ads** is a one-off purchase that hides the home banner. Reward
  videos stay available because they're opt-in and pay the player.
- **Privacy:** for the App Store build, personalised ads need Apple's App
  Tracking Transparency prompt; the plan is to ask once, and fall back to
  non-personalised ads if declined.

Implementation: `js/monetize/ads.js` is an adapter
(`showBanner` / `hideBanner` / `showRewarded`). The built-in provider shows
labelled placeholders; a real network (e.g. AdMob via Capacitor) plugs in
there.

## Purchases

- **Gold packs** (in the 🪙 store) and **Remove ads**.
- All purchases go through a billing adapter in `js/monetize/store.js`. The
  default is **test mode**: a confirm dialog that takes no money. Real
  purchases need the App Store build with StoreKit (e.g. via a Capacitor
  plugin) behind the same adapter.
- Premium paints cost 60–200 Gold; ordinary paints are free.

## Free Hay

- 500 welcome gift, 200 daily bonus (resets at local midnight), reward ads
  as above, and winnings.
- Hay is never zero for long: the daily bonus and reward ads mean a player who
  loses everything can always get back into a race.

## Tractor Rally economy

- Race prizes per track: 1st/2nd/3rd/4th, from 300 for a win on the first
  track up to 1,500 on the bonus track; the Ironman pack pays 1,100–1,500.
- Series multipliers: Quad Cup pays 1.6× and its upgrades cost 2×; Motorbike
  Cup pays 2.4× with upgrades at 3.5×.
- Fastest lap bonus: a tenth of the winner's prize. Cash bags on the track add
  a little more.
- **Farmyard Frenzy** (bonus round after each race): every 5 animals popped pays
  5% of the track's winning prize (15 per 5 on Muddy Meadow up to 75 per 5 on
  the bonus track), so popping all 100 is worth a race win, plus a 25%
  clean-sweep bonus.
- Rubber banding helps a player who falls far behind back into the race, but
  never past anyone, and rivals can't be bought off.

## Options we considered and didn't take

- **Selling Hay for real money**: rejected; it would turn the mini-games into
  real-money gambling and break the "earned, never sold" rule.
- **Banners in games or between races, interstitials**: rejected; the user
  wanted ads on the home page only.
- **Paid upgrades or paid track unlocks**: rejected as pay-to-win; progress
  comes from racing.
