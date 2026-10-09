const test = require('node:test');
const assert = require('node:assert');
const { createAdMobProvider, EV } = require('../js/monetize/admob.js');

const config = { live: false, ios: { banner: 'b', rewarded: 'r' }, testDevices: [], maxAdContentRating: 'ParentalGuidance' };

// A stand-in for the native plugin. `onShow` decides what the "player" does.
function fakePlugin({ consent = {}, tracking = 'notDetermined', allowTracking = false, loadFails = false, onShow } = {}) {
  const handlers = {};
  const calls = [];
  let status = tracking;
  const emit = (ev, data) => (handlers[ev] || []).slice().forEach((f) => f(data));
  const plugin = {
    calls,
    emit,
    async initialize(o) { calls.push(['initialize', o]); },
    async requestConsentInfo() { return { canRequestAds: true, isConsentFormAvailable: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED', ...consent }; },
    async showConsentForm() { calls.push(['showConsentForm']); return { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }; },
    async trackingAuthorizationStatus() { return { status }; },
    async requestTrackingAuthorization() { calls.push(['requestTracking']); status = allowTracking ? 'authorized' : 'denied'; },
    async showBanner(o) { calls.push(['showBanner', o]); },
    async removeBanner() { calls.push(['removeBanner']); },
    async prepareRewardVideoAd(o) {
      calls.push(['prepare', o]);
      if (loadFails) throw new Error('Loading failed');
      return { adUnitId: o.adId };
    },
    showRewardVideoAd() {
      calls.push(['show']);
      // Like the real plugin: settles only on a reward, never on an early close.
      return new Promise((resolve) => setTimeout(() => onShow({ emit, resolve }), 0));
    },
    async showPrivacyOptionsForm() { calls.push(['privacyForm']); },
    addListener(ev, f) {
      (handlers[ev] = handlers[ev] || []).push(f);
      return Promise.resolve({ remove: () => (handlers[ev] = handlers[ev].filter((g) => g !== f)) });
    },
  };
  return plugin;
}

const fakeEl = () => ({ innerHTML: 'x', style: {}, classList: { add() {} } });

test('watching to the end earns the reward', async () => {
  const plugin = fakePlugin({
    onShow: ({ emit, resolve }) => {
      emit(EV.rewarded, { amount: 1 });
      resolve({ amount: 1 });
      emit(EV.dismissed);
    },
  });
  const p = createAdMobProvider({ plugin, config });
  assert.strictEqual(await p.showRewarded(), true);
});

test('closing the ad early earns nothing (and does not hang)', async () => {
  const plugin = fakePlugin({ onShow: ({ emit }) => emit(EV.dismissed) });
  const p = createAdMobProvider({ plugin, config });
  assert.strictEqual(await p.showRewarded(), false);
});

test('no ad to show is reported as unavailable', async () => {
  const p = createAdMobProvider({ plugin: fakePlugin({ loadFails: true }), config });
  assert.strictEqual(await p.showRewarded(), 'unavailable');
  const q = createAdMobProvider({ plugin: fakePlugin({ onShow: ({ emit }) => emit(EV.failedToShow) }), config });
  assert.strictEqual(await q.showRewarded(), 'unavailable');
});

test('the next reward ad is loaded after one is shown', async () => {
  const plugin = fakePlugin({ onShow: ({ emit }) => emit(EV.dismissed) });
  const p = createAdMobProvider({ plugin, config });
  await p.showRewarded();
  await p.preload();
  assert.strictEqual(plugin.calls.filter((c) => c[0] === 'prepare').length, 2);
});

test('test ads until live; non-personalised unless tracking is allowed', async () => {
  const plugin = fakePlugin({ allowTracking: false, onShow: ({ emit }) => emit(EV.dismissed) });
  const p = createAdMobProvider({ plugin, config });
  await p.showRewarded();
  const prep = plugin.calls.find((c) => c[0] === 'prepare')[1];
  assert.deepStrictEqual(prep, { adId: 'r', isTesting: true, npa: true });
  assert.ok(plugin.calls.some((c) => c[0] === 'requestTracking'));

  const live = fakePlugin({ allowTracking: true, onShow: ({ emit }) => emit(EV.dismissed) });
  const q = createAdMobProvider({ plugin: live, config: { ...config, live: true } });
  await q.showRewarded();
  assert.deepStrictEqual(live.calls.find((c) => c[0] === 'prepare')[1], { adId: 'r', isTesting: false, npa: false });
});

test('consent form shown when needed, then privacy choices are offered', async () => {
  const plugin = fakePlugin({ consent: { canRequestAds: false, isConsentFormAvailable: true, status: 'REQUIRED' } });
  const p = createAdMobProvider({ plugin, config });
  await p.ready;
  assert.ok(plugin.calls.some((c) => c[0] === 'showConsentForm'));
  assert.strictEqual(p.privacyOptionsRequired, true);
});

test('no ads at all without consent', async () => {
  const plugin = fakePlugin({ consent: { canRequestAds: false, isConsentFormAvailable: false } });
  const p = createAdMobProvider({ plugin, config });
  assert.strictEqual(await p.showRewarded(), 'unavailable');
  await p.showBanner(fakeEl());
  assert.ok(!plugin.calls.some((c) => c[0] === 'showBanner'));
});

test('banner follows the home page: shown once, removed on leaving', async () => {
  const plugin = fakePlugin();
  const p = createAdMobProvider({ plugin, config });
  const el = fakeEl();
  await p.showBanner(el);
  await p.showBanner(el);
  await p.hideBanner(el);
  await p.showBanner(el);
  assert.deepStrictEqual(plugin.calls.filter((c) => /Banner/.test(c[0])).map((c) => c[0]), ['showBanner', 'removeBanner', 'showBanner']);
  assert.strictEqual(el.innerHTML, '');
});

test('leaving home before ads are set up never flashes a banner', async () => {
  const plugin = fakePlugin();
  const p = createAdMobProvider({ plugin, config });
  const el = fakeEl();
  p.showBanner(el);
  await p.hideBanner(el);
  assert.ok(!plugin.calls.some((c) => /Banner/.test(c[0])));
});
