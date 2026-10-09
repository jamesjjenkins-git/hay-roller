// Farmyard Rally shell: wallet UI, lobby and simple hash routing.
(function (root) {
  const wallet = root.FarmWallet.createWallet();
  const sound = root.FarmSound;
  const MAX_TOPUP = 100000;

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

  // ---------- Wallet ----------

  const modal = $('#wallet-modal');

  function renderBalance() {
    $('#balance').textContent = fmt(wallet.balance);
    $('#wallet-balance').textContent = fmt(wallet.balance);
    const pill = $('#wallet-btn');
    pill.classList.remove('bump');
    void pill.offsetWidth;
    pill.classList.add('bump');
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

  function openWallet() {
    renderHistory();
    renderBalance();
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }

  function addCredits(amount, note) {
    wallet.deposit(amount, note);
    sound.coins();
    toast(`+${fmt(amount)} credits added`, 'good');
    renderHistory();
  }

  $('#wallet-btn').addEventListener('click', () => {
    sound.click();
    openWallet();
  });

  $('#packs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-amount]');
    if (!b) return;
    addCredits(Number(b.dataset.amount), `Added ${b.querySelector('small').textContent.toLowerCase()}`);
  });

  $('#custom-add-btn').addEventListener('click', () => {
    const input = $('#custom-amount');
    const n = Math.floor(Number(input.value));
    if (!Number.isFinite(n) || n < 1 || n > MAX_TOPUP) {
      toast(`Enter a whole number between 1 and ${fmt(MAX_TOPUP)}`, 'warn');
      return;
    }
    addCredits(n, 'Custom top-up');
    input.value = '';
  });

  $('#custom-amount').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#custom-add-btn').click();
    }
  });

  $('#reset-wallet').addEventListener('click', () => {
    if (!confirm('Reset your wallet to 0 credits and clear its history?')) return;
    wallet.reset();
    renderHistory();
    toast('Wallet reset', 'info');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });

  wallet.subscribe(renderBalance);
  wallet.subscribe(() => games['tractor-rally'] && games['tractor-rally'].refresh());

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
      sound,
      toast,
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
    current = game;
    root.scrollTo(0, 0);
  }

  // Lobby art: a tractor in your current paint job.
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
    const paint = root.TractorGarage.createGarage().paintHex();
    const draw = (px, py, color, s) => {
      x.save();
      x.translate(px, py);
      x.scale(s, s);
      root.TractorRender.drawTractor(x, { x: 0, y: 0, z: 0, heading: 0, steer: 0, color, isPlayer: color === paint, bump: 0, progress: px, id: 0 }, 0);
      x.restore();
    };
    const s = Math.min(2.6, Math.max(1.4, h / 90));
    draw(w * 0.25, h * 0.38, '#2f7de2', s);
    draw(w * 0.42, h * 0.62, '#2fae4a', s);
    draw(w * 0.68, h * 0.45, paint, s * 1.1);
  }

  root.addEventListener('hashchange', route);
  root.addEventListener('resize', drawLobbyArt);
  renderBalance();
  route();

  if (wallet.balance === 0 && wallet.history().length === 0) {
    setTimeout(() => toast('Tap the credits at the top to top up your wallet!', 'info', 5000), 600);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
