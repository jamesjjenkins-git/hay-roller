# Monetisation decisions

What we decided about ads, purchases and the in-game economy, and why. The
README describes how it works; this records the choices behind it so they
don't get re-argued (or quietly undone).

## Principles

- **Hay is earned, never sold.** Hay is the play-money that the credit games
  (Hay Bale Derby, Piggy Bank Slots, Egg Roulette) and Farmyard Rally (the racing game) use. It
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
- **Privacy:** in the iPhone app, Google's consent form is shown on first
  launch where the law needs it (UK/EEA), then Apple's App Tracking
  Transparency prompt, once. Declining tracking still shows ads, just
  non-personalised ones; without consent no ads are requested at all. Where
  consent rules require it, "Ad privacy choices" on the home page lets the
  player change their mind.
- **Network:** Google AdMob, through `@capacitor-community/admob`, chosen
  because it fits the Capacitor app and covers both banner and rewarded
  video with Google's own consent form. Ads are capped at the
  ParentalGuidance content rating: it's a cartoon farm game.
- **Test ads until switched live.** `js/monetize/ad-config.js` has a `live`
  switch; until it's on, every request is a Google test ad, so developing
  and testing never risks invalid-traffic flags on the AdMob account.

Implementation: `js/monetize/ads.js` is an adapter
(`showBanner` / `hideBanner` / `showRewarded`). In a browser the built-in
provider shows labelled placeholders; in the iPhone app
`js/monetize/admob.js` swaps in AdMob.

## Purchases

- **Gold packs** (in the 🪙 store) and **Remove ads**.
- All purchases go through a billing adapter in `js/monetize/store.js`. In a
  browser it's **test mode**: a confirm dialog that takes no money. In the
  iPhone app it's **Apple in-app purchase**, and the app never falls back to
  test mode (if the App Store can't be reached, purchases are just off).
- **Our own small StoreKit 2 plugin** (`plugins/farm-store`) rather than a
  third-party one: four products don't need a purchase service like
  RevenueCat, the third-party plugins ship releases almost daily, and we need
  exact control of when a purchase is finished. The plugin only talks to
  StoreKit; the rules are in `js/monetize/iap.js` and `store.js`.
- **Grant, then finish, once.** A paid purchase is granted before Apple is
  told it's done, and each transaction is granted at most once (the ids are
  remembered). Purchases that complete outside the purchase flow (the app
  closed mid-purchase, Ask to Buy approved later) are picked up on launch and
  as they arrive. So nothing paid for is lost and nothing is given twice.
- **Apple says who owns Remove ads.** The saved flag is only for the first
  paint; on launch it's checked against the App Store, so a restore on a new
  phone adds it and a refund removes it. A Restore purchases button is in the
  store (App Review requires one).
- Prices shown in the app are the App Store's own, in the player's currency.
- Premium paints cost 60–200 Gold; ordinary paints are free.

## Free Hay

- 500 welcome gift, 200 daily bonus (resets at local midnight), reward ads
  as above, and winnings.
- Hay is never zero for long: the daily bonus and reward ads mean a player who
  loses everything can always get back into a race.

## Farmyard Rally economy

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
