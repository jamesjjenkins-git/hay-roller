// Free Hay: welcome gift, daily bonus and opt-in rewarded ads (capped per day).
// Hay is never sold; these, plus winnings, are the only ways to get it.
(function (root) {
  const KEY = 'farmCasino.rewards.v1';
  const AMOUNTS = {
    welcome: 500,
    daily: 200,
    ad: 150,
  };
  const ADS_PER_DAY = 10;

  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function createRewards({ storage, wallet, now = () => Date.now() }) {
    let state = load();

    function load() {
      try {
        const raw = storage && storage.getItem(KEY);
        if (raw) return { welcomed: false, lastDaily: null, adDay: null, adsToday: 0, ...JSON.parse(raw) };
      } catch (e) {
        // Fall through to a fresh state.
      }
      return { welcomed: false, lastDaily: null, adDay: null, adsToday: 0 };
    }

    function save() {
      try {
        if (storage) storage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        // Ignore.
      }
    }

    function adsUsedToday() {
      return state.adDay === dayKey(now()) ? state.adsToday : 0;
    }

    return {
      AMOUNTS,
      ADS_PER_DAY,
      // One-off gift so a new player can start racing and betting.
      claimWelcome() {
        if (state.welcomed) return 0;
        state.welcomed = true;
        save();
        wallet.credit(AMOUNTS.welcome, 'Welcome gift');
        return AMOUNTS.welcome;
      },
      dailyAvailable() {
        return state.lastDaily !== dayKey(now());
      },
      // Milliseconds until local midnight, when the next daily bonus unlocks.
      msUntilDaily() {
        const d = new Date(now());
        const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        return midnight - d.getTime();
      },
      claimDaily() {
        if (!this.dailyAvailable()) return 0;
        state.lastDaily = dayKey(now());
        save();
        wallet.credit(AMOUNTS.daily, 'Daily bonus');
        return AMOUNTS.daily;
      },
      adsRemaining() {
        return Math.max(0, ADS_PER_DAY - adsUsedToday());
      },
      // Called only after an ad has played to the end. `amount` lets a
      // placement (e.g. "double your prize") pay something other than the default.
      grantAdReward(placement, amount = AMOUNTS.ad) {
        if (this.adsRemaining() <= 0 || !Number.isInteger(amount) || amount <= 0) return 0;
        const today = dayKey(now());
        state.adsToday = adsUsedToday() + 1;
        state.adDay = today;
        save();
        wallet.credit(amount, placement === 'double' ? 'Ad reward — doubled race prize' : 'Ad reward');
        return amount;
      },
    };
  }

  const api = { createRewards, AMOUNTS, ADS_PER_DAY, dayKey };
  root.FarmRewards = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
