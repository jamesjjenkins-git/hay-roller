// Farmyard Rally shell: wallet UI, lobby and simple hash routing.
(function (root) {
  const wallet = root.FarmWallet.createWallet();
  const gold = root.FarmWallet.createWallet(undefined, { key: root.FarmWallet.GOLD_KEY });
  const sound = root.FarmSound;
  const ads = root.FarmAds;
  const DEV = /[?&]dev\b/.test(location.search);
  let storage = null;
  try {
    storage = root.localStorage;
  } catch (e) {
    storage = null;
  }
  const rewards = root.FarmRewards.createRewards({ storage, wallet });
  // In the iPhone app purchases are real (Apple in-app purchase); only the
  // browser build uses the free test mode. The app never falls back to it.
  const isNativeApp = !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform());
  const iapPlugin = root.FarmIAP && root.FarmIAP.nativePlugin();
  const billing = iapPlugin
    ? root.FarmIAP.createAppStoreBilling({ plugin: iapPlugin })
    : isNativeApp
      ? { async loadProducts() { throw new Error('In-app purchase unavailable'); }, async purchase() { return { ok: false, error: 'unavailable' }; }, async restore() { return []; } }
      : root.FarmStore.testBilling(async (p) =>
        confirm(`TEST MODE — no money will be taken.\n\nBuy "${p.name}" (${p.price} in the App Store)?`));
  const store = root.FarmStore.createStore({ storage, goldWallet: gold, billing });

  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => n.toLocaleString('en-GB');

  // ---------- Toasts ----------

  function toast(message, kind = 'info', ms = 3200) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = message;
    $('#toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  // ---------- Wallet & store ----------

  const modal = $('#wallet-modal');

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function renderBalance() {
    $('#balance').textContent = fmt(wallet.balance);
    $('#wallet-balance').textContent = fmt(wallet.balance);
    bump($('#wallet-btn'));
  }

  function renderGold() {
    $('#gold-balance').textContent = fmt(gold.balance);
    $('#wallet-gold').textContent = fmt(gold.balance);
    bump($('#gold-btn'));
  }

  function renderHistory() {
    const items = wallet.history().slice(0, 30);
    $('#history').innerHTML = items.length
      ? items.map((h) => {
          const when = new Date(h.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          const sign = h.amount > 0 ? '+' : '−';
          return `<li class="${h.type}"><span class="h-note">${escapeHtml(h.note)}<small>${when}</small></span><b>${sign}${fmt(Math.abs(h.amount))}</b></li>`;
        }).join('')
      : '<li class="empty">No activity yet.</li>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function renderFreeHay() {
    const daily = $('#daily-btn');
    if (rewards.dailyAvailable()) {
      daily.disabled = false;
      daily.innerHTML = `<span class="f-icon">🎁</span><b>Daily bonus</b><small>Claim 🌾${fmt(rewards.AMOUNTS.daily)}</small>`;
    } else {
      const h = Math.ceil(rewards.msUntilDaily() / 3600000);
      daily.disabled = true;
      daily.innerHTML = `<span class="f-icon">✅</span><b>Daily bonus claimed</b><small>Back in about ${h} hour${h === 1 ? '' : 's'}</small>`;
    }
    const adBtn = $('#ad-btn');
    const left = rewards.adsRemaining();
    adBtn.disabled = left === 0;
    adBtn.innerHTML = left
      ? `<span class="f-icon">📺</span><b>Watch a short ad</b><small>Get 🌾${fmt(rewards.AMOUNTS.ad)} · ${left} left today</small>`
      : '<span class="f-icon">📺</span><b>No more ads today</b><small>Come back tomorrow</small>';
  }

  function renderStore() {
    $('#test-mode-note').classList.toggle('hidden', !store.testMode);
    $('#store-unavailable').classList.toggle('hidden', store.available);
    const off = store.available ? '' : ' disabled';
    $('#store-packs').innerHTML = store.PRODUCTS.filter((p) => p.kind === 'gold').map((p) => `
      <button type="button" class="pack gold-pack" data-buy="${p.id}"${off}>
        ${p.tag ? `<span class="pack-tag">${p.tag}</span>` : ''}
        <span class="pack-coin">🪙</span><b>${fmt(p.gold)}</b><small>${p.name}</small><span class="price">${store.price(p.id)}</span>
      </button>`).join('');
    const ra = store.PRODUCTS.find((p) => p.id === 'remove_ads');
    $('#store-extras').innerHTML = store.owns('remove_ads')
      ? `<div class="store-row owned"><span>🚫📢</span><span><b>Ads removed</b><small>Thanks for supporting the farm!</small></span><span class="price">Owned ✓</span></div>`
      : `<button type="button" class="store-row" data-buy="remove_ads"${off}><span>🚫📢</span><span><b>${ra.name}</b><small>${ra.desc}</small></span><span class="price">${store.price('remove_ads')}</span></button>`;
    $('#restore-purchases').classList.toggle('hidden', store.testMode);
  }

  function openWallet(section) {
    renderHistory();
    renderBalance();
    renderGold();
    renderFreeHay();
    renderStore();
    $('#dev-topup').classList.toggle('hidden', !DEV);
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    // No banner over the wallet (in the app it's a native view on top of the page).
    updateBanner(false);
    if (section === 'gold') $('#w-gold').scrollIntoView({ block: 'start' });
  }

  // Shows a rewarded ad and pays out only if it was watched to the end.
  async function watchAdFor(placement, amount) {
    if (rewards.adsRemaining() <= 0) {
      toast('No more reward ads today — come back tomorrow!', 'info');
      return 0;
    }
    const watched = await ads.showRewarded();
    if (!watched) {
      if (ads.lastResult === 'unavailable') toast('No ad to show right now — try again in a minute.', 'info');
      else toast('Ad closed early — no reward this time.', 'info');
      return 0;
    }
    const got = rewards.grantAdReward(placement, amount);
    if (got) {
      sound.coins();
      toast(`+🌾${fmt(got)} Hay — thanks for watching!`, 'good');
    }
    return got;
  }

  $('#wallet-btn').addEventListener('click', () => {
    sound.click();
    openWallet();
  });
  $('#gold-btn').addEventListener('click', () => {
    sound.click();
    openWallet('gold');
  });

  $('#daily-btn').addEventListener('click', () => {
    const got = rewards.claimDaily();
    if (got) {
      sound.coins();
      toast(`+🌾${fmt(got)} daily bonus!`, 'good');
    }
    renderFreeHay();
    renderHistory();
  });

  $('#ad-btn').addEventListener('click', async () => {
    // Close the wallet so the ad has the screen, then reopen it after.
    modal.close();
    await watchAdFor('wallet');
    openWallet();
  });

  modal.addEventListener('click', async (e) => {
    const buy = e.target.closest('[data-buy]');
    const dev = e.target.closest('[data-dev]');
    if (buy) {
      const id = buy.dataset.buy;
      buy.disabled = true;
      const res = await store.buy(id);
      if (res.ok && !res.already) {
        sound.fanfare();
        const p = store.PRODUCTS.find((x) => x.id === id);
        toast(p.kind === 'gold' ? `+🪙${fmt(p.gold)} Gold added` : `${p.name} — done!`, 'good');
      } else if (res.pending) {
        toast("Waiting for approval — it'll arrive as soon as it's approved.", 'info', 5000);
      } else if (res.error) {
        toast(res.error === 'unavailable' ? "The store isn't available right now." : res.error, 'warn');
      }
      renderStore();
      renderGold();
    } else if (dev) {
      wallet.deposit(Number(dev.dataset.dev), 'Developer top-up');
      renderHistory();
    } else if (e.target === modal) {
      modal.close();
    }
  });

  $('#restore-purchases').addEventListener('click', async () => {
    try {
      const ids = await store.restore();
      toast(ids.length ? 'Purchases restored.' : 'Nothing to restore on this Apple ID.', 'info');
    } catch (e) {
      toast("Couldn't reach the App Store to restore purchases.", 'warn');
    }
    renderStore();
  });

  // Purchases that complete later (Ask to Buy approved, or interrupted last time).
  store.onDelivered((p) => {
    sound.fanfare();
    toast(p.kind === 'gold' ? `+🪙${fmt(p.gold)} Gold added — thanks!` : `${p.name} — done!`, 'good');
    renderGold();
  });
  store.subscribe(() => renderStore());
  store.init();

  $('#reset-wallet').addEventListener('click', () => {
    if (!confirm('Reset your Hay to 0 and clear its history? (Gold and purchases are kept.)')) return;
    wallet.reset();
    renderHistory();
    toast('Wallet reset', 'info');
  });

  wallet.subscribe(renderBalance);
  wallet.subscribe(() => games['tractor-rally'] && games['tractor-rally'].refresh());
  gold.subscribe(renderGold);
  gold.subscribe(() => games['tractor-rally'] && games['tractor-rally'].refresh());

  // ---------- Home banner (the only place a banner ad ever appears) ----------

  const banner = $('#home-banner');
  function updateBanner(onHome) {
    const show = onHome && !store.owns('remove_ads');
    banner.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-banner', show);
    if (show) ads.showBanner(banner);
    else ads.hideBanner(banner);
  }
  store.subscribe(() => updateBanner(!current && !modal.open));
  modal.addEventListener('close', () => updateBanner(!current));

  // Where consent rules need it, a way to change your ad privacy choices.
  const privacyBtn = $('#ad-privacy');
  function renderAdPrivacy() {
    privacyBtn.classList.toggle('hidden', !ads.privacyOptionsRequired);
  }
  privacyBtn.addEventListener('click', () => ads.showPrivacyOptions());
  ads.onChange(renderAdPrivacy);
  renderAdPrivacy();

  // ---------- Sound toggle ----------

  const muteBtn = $('#mute-btn');
  function renderMute() {
    muteBtn.textContent = sound.muted ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    renderMute();
    sound.click();
  });
  renderMute();

  // ---------- Games & routing ----------

  const games = {
    'tractor-rally': root.TractorRally.createTractorRally({
      el: $('#view-tractor-rally'),
      wallet,
      gold,
      sound,
      toast,
      rewards,
      watchAdFor,
      openWallet,
    }),
    slots: root.SlotsGame.createSlots({ el: $('#view-slots'), wallet, sound, toast }),
    'egg-roulette': root.EggRouletteGame.createEggRoulette({ el: $('#view-egg-roulette'), wallet, sound, toast }),
    'hay-derby': root.HayDerby.createHayDerby({
      el: $('#view-hay-derby'),
      wallet,
      sound,
      toast,
      openWallet,
    }),
  };
  let current = null;

  function route() {
    const name = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
    const game = games[name] ? name : null;
    if (current && current !== game) games[current].unmount();
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    if (game) {
      $(`#view-${game}`).classList.remove('hidden');
      if (current !== game) games[game].mount();
    } else {
      $('#view-lobby').classList.remove('hidden');
      drawLobbyArt();
    }
    updateBanner(!game);
    current = game;
    root.scrollTo(0, 0);
  }

  // Lobby art: a tractor, a quad and a motorbike (yours in your paint job).
  function drawLobbyArt() {
    const c = $('#lobby-tractor-art');
    if (!c || !c.clientWidth) return;
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = c.clientWidth;
    const h = c.clientHeight;
    x.fillStyle = '#d9a066';
    x.fillRect(0, h * 0.22, w, h * 0.56);
    x.fillStyle = '#8a5a2b';
    x.fillRect(0, h * 0.22 - 6, w, 6);
    x.fillRect(0, h * 0.78, w, 6);
    const g = root.TractorGarage.createGarage();
    const paint = g.paintHex();
    const draw = (px, py, color, s, vehicle) => {
      x.save();
      x.translate(px, py);
      x.scale(s, s);
      const mine = color === paint;
      root.TractorRender.drawTractor(x, { x: 0, y: 0, z: 0, heading: 0, steer: 0, color, vehicle, isPlayer: mine, bump: 0, progress: px, id: 0, look: mine ? g.look : null }, 0);
      x.restore();
    };
    const s = Math.min(2.6, Math.max(1.4, h / 90));
    draw(w * 0.25, h * 0.38, '#2f7de2', s, 'tractor');
    draw(w * 0.42, h * 0.62, '#2fae4a', s, 'quad');
    draw(w * 0.68, h * 0.45, paint, s * 1.1, 'motorbike');
  }

  root.addEventListener('hashchange', route);
  root.addEventListener('resize', drawLobbyArt);
  renderBalance();
  route();

  // ---------- Version / updates ----------

  $('#app-version').textContent = root.FarmUpdate ? root.FarmUpdate.current : 'dev';
  $('#check-updates').addEventListener('click', async () => {
    const r = root.FarmUpdate ? await root.FarmUpdate.check() : 'dev';
    if (r === 'updated') toast('A new version is ready — tap the banner to update.', 'good');
    else if (r === 'current') toast("You're on the latest version.", 'info');
    else if (r === 'offline') toast("Couldn't check for updates — are you online?", 'warn');
    else toast('Update checks only run on the published site.', 'info');
  });

  renderGold();
  const welcome = rewards.claimWelcome();
  if (welcome) setTimeout(() => toast(`Welcome to the farm! Here's 🌾${fmt(welcome)} Hay to get you started.`, 'good', 5000), 600);
})(typeof globalThis !== 'undefined' ? globalThis : this);
