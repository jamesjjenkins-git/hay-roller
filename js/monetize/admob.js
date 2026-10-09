// Real ads in the iPhone app: Google AdMob through the
// @capacitor-community/admob plugin, behind the FarmAds provider interface.
// In a browser (no native plugin) nothing changes and the placeholder
// provider stays in place.
//
// On launch: ask for ad consent where the law needs it (Google's consent
// form, UK/EEA), then Apple's tracking prompt once. Declining either still
// shows ads, just non-personalised ones.
(function (root) {
  const EV = {
    rewarded: 'onRewardedVideoAdReward',
    dismissed: 'onRewardedVideoAdDismissed',
    failedToShow: 'onRewardedVideoAdFailedToShow',
    bannerSize: 'bannerAdSizeChanged',
  };

  function createAdMobProvider({ plugin, config, log = () => {} }) {
    const testing = !config.live;
    let canRequestAds = false;
    let npa = true; // non-personalised until tracking is allowed
    let privacyRequired = false;
    const listeners = new Set();

    const ready = (async () => {
      await plugin.initialize({
        initializeForTesting: testing || config.testDevices.length > 0,
        testingDevices: config.testDevices,
        maxAdContentRating: config.maxAdContentRating,
      });
      let consent = await plugin.requestConsentInfo({ testDeviceIdentifiers: config.testDevices });
      if (!consent.canRequestAds && consent.isConsentFormAvailable) consent = await plugin.showConsentForm();
      canRequestAds = consent.canRequestAds !== false;
      privacyRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
      let tracking = await plugin.trackingAuthorizationStatus();
      if (tracking.status === 'notDetermined') {
        await plugin.requestTrackingAuthorization();
        tracking = await plugin.trackingAuthorizationStatus();
      }
      npa = tracking.status !== 'authorized';
      listeners.forEach((f) => f());
    })().catch((e) => log('AdMob setup failed', e));

    const opts = (adId) => ({ adId, isTesting: testing, npa });

    // ----- Banner: a native view laid over the bottom of the page. -----
    let wantBanner = false;
    let bannerUp = false;
    let bannerEl = null;
    let syncing = Promise.resolve();
    plugin.addListener(EV.bannerSize, (size) => {
      // Reserve the banner's height in the page so it never covers content.
      if (bannerEl) bannerEl.style.height = size && size.height ? `${size.height}px` : '';
    });
    function syncBanner() {
      syncing = syncing.then(async () => {
        await ready;
        if (wantBanner && canRequestAds && !bannerUp) {
          await plugin.showBanner({ ...opts(config.ios.banner), adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0 });
          bannerUp = true;
        } else if (!wantBanner && bannerUp) {
          await plugin.removeBanner();
          bannerUp = false;
          if (bannerEl) bannerEl.style.height = '';
        }
      }).catch((e) => {
        bannerUp = false;
        log('Banner failed', e);
      });
      return syncing;
    }

    // ----- Rewarded video: loaded ahead of time, so it's ready to play. -----
    let loading = null;
    function preload() {
      if (!loading) {
        loading = ready.then(() => {
          if (!canRequestAds) throw new Error('No consent to request ads');
          return plugin.prepareRewardVideoAd(opts(config.ios.rewarded));
        });
        loading.catch((e) => {
          loading = null;
          log('Rewarded ad failed to load', e);
        });
      }
      return loading;
    }

    return {
      name: 'admob',
      ready,
      showBanner(el) {
        bannerEl = el;
        el.innerHTML = '';
        el.classList.add('ad-native');
        wantBanner = true;
        return syncBanner();
      },
      hideBanner(el) {
        if (el) el.style.height = '';
        wantBanner = false;
        return syncBanner();
      },
      // Resolves true if watched to the end, false if closed early, or
      // 'unavailable' if there was no ad to show.
      async showRewarded() {
        try {
          await preload();
        } catch (e) {
          return 'unavailable';
        }
        loading = null;
        const subs = [];
        let earned = false;
        const result = await new Promise((resolve) => {
          const finish = (v) => resolve(v);
          Promise.all([
            plugin.addListener(EV.rewarded, () => (earned = true)),
            plugin.addListener(EV.dismissed, () => finish(earned)),
            plugin.addListener(EV.failedToShow, () => finish('unavailable')),
          ]).then((hs) => {
            subs.push(...hs);
            // The plugin's promise only settles on a reward or an error; a
            // player closing the ad early is reported by the Dismissed event.
            plugin.showRewardVideoAd().catch(() => finish('unavailable'));
          });
        });
        subs.forEach((h) => h.remove());
        preload();
        return result;
      },
      get privacyOptionsRequired() {
        return privacyRequired;
      },
      showPrivacyOptions() {
        return plugin.showPrivacyOptionsForm();
      },
      onChange(f) {
        listeners.add(f);
      },
      preload,
    };
  }

  const api = { createAdMobProvider, EV };
  root.FarmAdMob = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // In the iPhone app, swap the placeholders for real ads.
  const cap = root.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.isPluginAvailable && cap.isPluginAvailable('AdMob') && root.FarmAds) {
    const provider = createAdMobProvider({
      plugin: cap.registerPlugin('AdMob'),
      config: root.FarmAdConfig,
      log: (...a) => console.warn(...a),
    });
    root.FarmAds.setProvider(provider);
    provider.preload();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
