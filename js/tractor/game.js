// Tractor Rally — garage UI, race loop, touch/keyboard controls, results.
(function (root) {
  const Sim = root.TractorSim;
  const { TRACKS, WORLD, buildTrack } = root.TractorTracks;
  const { UPGRADES, PAINTS, TROPHIES, MAX_LEVEL, createGarage } = root.TractorGarage;
  const TROPHY_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };
  const SELECTED_KEY = 'farmCasino.tractor.track';
  const VIEW_KEY = 'farmCasino.tractor.view';

  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
  const fmt = (n) => n.toLocaleString('en-GB');
  const fmtLap = (t) => (t == null ? '—' : t < 60 ? `${t.toFixed(2)}s` : fmtTime(t));
  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  function createTractorRally({ el, wallet, gold, sound, toast, rewards, watchAdFor, openWallet }) {
    const $ = (sel) => el.querySelector(sel);
    const garage = createGarage();
    const built = new Map();
    const getTrack = (def) => {
      if (!built.has(def.id)) built.set(def.id, buildTrack(def));
      return built.get(def.id);
    };

    const garageEl = $('#garage');
    const raceEl = $('#race-screen');
    const canvas = $('#tractor-canvas');
    const modal = $('#race-modal');
    const renderer = root.TractorRender.createRenderer(canvas);

    let selected = TRACKS.find((t) => t.id === localStorage.getItem(SELECTED_KEY)) || TRACKS[0];
    if (!garage.isUnlocked(selected)) selected = TRACKS[0];

    let sim = null;
    let phase = 'garage'; // garage | countdown | racing | paused | results
    let countdown = 0;
    let acc = 0;
    let rafId = null;
    let lastNow = 0;
    let banner = null;
    let finalLapShown = false;
    let lapFlash = null;
    let lastEarnings = null;
    let mounted = false;

    // ---------- Input ----------

    const input = { slide: 0, brake: false, nitro: false, keys: new Set() };

    function playerInput() {
      const me = sim.racers[0];
      let steer = 0;
      const k = input.keys;
      if (k.has('ArrowLeft') || k.has('a')) steer -= 1;
      if (k.has('ArrowRight') || k.has('d')) steer += 1;
      // Touch slider: left/right steers directly, like the arrow keys but analogue.
      if (steer === 0) steer = input.slide;
      const brake = input.brake || k.has('ArrowDown') || k.has('s') ? 1 : 0;
      const nitro = input.nitro || k.has(' ') || k.has('Shift');
      input.nitro = false;
      return { steer, throttle: brake ? 0 : 1, brake, nitro };
    }

    const stickZone = $('#stick-zone');
    const stickBase = $('#stick-base');
    const stickKnob = $('#stick-knob');
    let stickTouch = null;
    let stickOrigin = null;

    function stickStart(id, x, y) {
      stickTouch = id;
      stickOrigin = { x, y };
      stickZone.classList.add('used');
      stickBase.style.left = `${x}px`;
      stickBase.style.top = `${y}px`;
      stickBase.classList.add('active');
      stickMove(x);
    }
    // Horizontal slider: the further from where your thumb landed, the harder
    // you turn. A small dead zone keeps the tractor straight when you rest.
    const SLIDE_MAX = 36;
    const SLIDE_DEAD = 3;
    function stickMove(x) {
      const dx = Math.max(-SLIDE_MAX, Math.min(SLIDE_MAX, x - stickOrigin.x));
      stickKnob.style.transform = `translateX(${dx}px)`;
      const mag = Math.max(0, Math.abs(dx) - SLIDE_DEAD) / (SLIDE_MAX - SLIDE_DEAD);
      // Front-loaded curve: a small nudge already gives a useful turn.
      input.slide = Math.sign(dx) * Math.pow(mag, 0.6);
    }
    function stickEnd() {
      stickTouch = null;
      input.slide = 0;
      stickBase.classList.remove('active');
      stickKnob.style.transform = '';
    }

    stickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (stickTouch != null) return;
      const t = e.changedTouches[0];
      const r = stickZone.getBoundingClientRect();
      stickStart(t.identifier, t.clientX - r.left, t.clientY - r.top);
    }, { passive: false });
    stickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouch) {
          const r = stickZone.getBoundingClientRect();
          stickMove(t.clientX - r.left);
        }
      }
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickTouch) stickEnd();
    };
    stickZone.addEventListener('touchend', touchEnd);
    stickZone.addEventListener('touchcancel', touchEnd);
    // Mouse fallback so the slider can be tried on desktop too.
    stickZone.addEventListener('mousedown', (e) => {
      const r = stickZone.getBoundingClientRect();
      stickStart('mouse', e.clientX - r.left, e.clientY - r.top);
    });
    root.addEventListener('mousemove', (e) => {
      if (stickTouch !== 'mouse') return;
      const r = stickZone.getBoundingClientRect();
      stickMove(e.clientX - r.left);
    });
    root.addEventListener('mouseup', () => stickTouch === 'mouse' && stickEnd());

    function holdButton(btn, on, off) {
      const start = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        on();
      };
      const end = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        if (off) off();
      };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('touchcancel', end, { passive: false });
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', (e) => btn.classList.contains('pressed') && end(e));
    }
    holdButton($('#btn-brake'), () => (input.brake = true), () => (input.brake = false));
    holdButton($('#btn-nitro'), () => (input.nitro = true));

    root.addEventListener('keydown', (e) => {
      if (!mounted || phase === 'garage') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'Escape' || e.key === 'p') {
        togglePause();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        setViewMode(viewMode === 'chase' ? 'full' : 'chase');
        return;
      }
      input.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    root.addEventListener('keyup', (e) => input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (phase === 'racing' || phase === 'countdown')) togglePause();
    });

    $('#btn-pause').addEventListener('click', togglePause);

    // ---------- Layout ----------

    // 'full' shows the whole track (Super Off Road); 'chase' is a zoomed
    // camera that follows you and fills the screen (Micro Machines).
    let viewMode = localStorage.getItem(VIEW_KEY) === 'chase' ? 'chase' : 'full';
    renderer.setMode(viewMode);

    // The camera button names the view it will switch *to*.
    function renderViewButton() {
      const toFull = viewMode === 'chase';
      $('#btn-view .cam-label').textContent = toFull ? 'Whole track' : 'Close-up';
      $('#btn-view').setAttribute('aria-label', toFull ? 'Switch camera to the whole track' : 'Switch camera to close-up');
    }

    function setViewMode(m) {
      viewMode = m;
      try {
        localStorage.setItem(VIEW_KEY, m);
      } catch (e) {
        // Ignore.
      }
      renderer.setMode(m);
      raceEl.classList.toggle('chase', m === 'chase');
      renderViewButton();
      layout();
    }

    function layout() {
      if (phase === 'garage') return;
      const vw = root.innerWidth;
      const vh = root.innerHeight;
      if (viewMode === 'chase') {
        renderer.resize(vw, vh);
      } else {
        const k = Math.min(vw / WORLD.width, vh / WORLD.height);
        renderer.resize(Math.floor(WORLD.width * k), Math.floor(WORLD.height * k));
      }
      raceEl.classList.toggle('portrait', vh > vw);
    }
    $('#btn-view').addEventListener('click', () => {
      sound.click();
      setViewMode(viewMode === 'chase' ? 'full' : 'chase');
    });
    root.addEventListener('resize', () => mounted && layout());
    root.addEventListener('orientationchange', () => setTimeout(() => mounted && layout(), 200));

    // ---------- Garage ----------

    function renderGarage() {
      const st = garage.state;
      const tot = garage.awardTotals();
      $('#garage-record').innerHTML = `🏆 <span>🥇${tot.gold} 🥈${tot.silver} 🥉${tot.bronze} ⏱️${tot.fastest}</span>`;

      $('#paints').innerHTML = PAINTS.map((p) =>
        `<button class="paint ${st.paint === p.id ? 'active' : ''} ${garage.paintOwned(p.id) ? '' : 'locked'}" data-paint="${p.id}" style="--paint:${p.hex}"
          title="${p.name}${garage.paintOwned(p.id) ? '' : ` — 🪙${p.gold} Gold`}" aria-label="${p.name} paint${garage.paintOwned(p.id) ? '' : `, costs ${p.gold} Gold`}">${garage.paintOwned(p.id) ? '' : `<span class="paint-price">🪙${p.gold}</span>`}</button>`).join('');

      const stats = Sim.statsFor(st.upgrades);
      const max = Sim.statsFor({ accel: 5, speed: 5, handling: 5, boost: 5 });
      const base = Sim.statsFor({});
      const bar = (label, v, lo, hi) => {
        const pct = Math.round(15 + ((v - lo) / (hi - lo)) * 85);
        return `<div class="sbar"><span>${label}</span><div class="sbar-track"><div class="sbar-fill" style="width:${pct}%"></div></div></div>`;
      };
      $('#stat-bars').innerHTML =
        bar('Accel', stats.accel, base.accel, max.accel) +
        bar('Speed', stats.topSpeed, base.topSpeed, max.topSpeed) +
        bar('Handling', stats.turnRate, base.turnRate, max.turnRate) +
        `<div class="sbar"><span>Boosts</span><b>${'🔥'.repeat(stats.nitros)}</b></div>`;

      $('#upgrade-list').innerHTML = UPGRADES.map((u) => {
        const lvl = st.upgrades[u.id];
        const cost = garage.nextCost(u.id);
        const afford = cost != null && wallet.canAfford(cost);
        const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
        return `<div class="upgrade">
          <div class="u-icon">${u.icon}</div>
          <div class="u-info"><b>${u.name}</b><small>${u.desc}</small><div class="pips">${pips}</div></div>
          ${cost == null
            ? '<span class="u-max">MAX</span>'
            : `<button class="btn btn-buy ${afford ? '' : 'cant'}" data-buy="${u.id}">🌾 ${fmt(cost)}</button>`}
        </div>`;
      }).join('');

      $('#track-list').innerHTML = TRACKS.map((t) => {
        const unlocked = garage.isUnlocked(t);
        const best = st.best[t.id];
        const aw = st.awards[t.id];
        const need = t.unlock && TRACKS.find((x) => x.id === t.unlock.track);
        const badge = best && best.place <= 3 ? `<span class="t-trophy" title="Best finish: ${ordinal(best.place)}">${TROPHY_ICON[TROPHIES[best.place - 1].id]}</span>` : '';
        return `<button class="track ${selected.id === t.id ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-track="${t.id}" ${unlocked ? '' : 'disabled'}>
          <canvas class="track-thumb" data-thumb="${t.id}" width="240" height="136"></canvas>
          <span class="t-info">
            <b>${unlocked ? '' : '🔒 '}${t.name}</b>
            <small>${unlocked ? t.blurb : `Finish ${ordinal(t.unlock.place)} or better on ${need.name} to unlock`}</small>
            <small class="t-meta">#${TRACKS.indexOf(t) + 1} · ${t.laps} laps · 1st pays 🌾${fmt(t.reward[0])}${best ? ` · Best: ${ordinal(best.place)}` : ''}${aw && aw.bestLap ? ` · Lap ${fmtLap(aw.bestLap)}` : ''}</small>
          </span>
          ${badge}
        </button>`;
      }).join('');
      el.querySelectorAll('[data-thumb]').forEach((c) => drawThumb(c, getTrack(TRACKS.find((t) => t.id === c.dataset.thumb))));
      // Keep the selected track in view, whether the list scrolls down or sideways.
      const active = $('#track-list .track.active');
      const list = $('#track-list');
      if (active && list.scrollWidth > list.clientWidth + 4) {
        if (list.scrollLeft === 0) list.scrollLeft = Math.max(0, active.offsetLeft - list.offsetLeft - 12);
      } else if (active && list.scrollTop === 0) {
        list.scrollTop = Math.max(0, active.offsetTop - list.offsetTop - 8);
      }
      $('#dock-track-name').textContent = selected.name;

      drawPreview();
    }

    function drawThumb(c, t) {
      const x = c.getContext('2d');
      const k = c.width / WORLD.width;
      x.fillStyle = '#6fbf4f';
      x.fillRect(0, 0, c.width, c.height);
      x.save();
      x.scale(k, k);
      x.lineJoin = 'round';
      x.beginPath();
      t.samples.forEach((s, i) => (i ? x.lineTo(s.x, s.y) : x.moveTo(s.x, s.y)));
      x.closePath();
      x.strokeStyle = '#8a5a2b';
      x.lineWidth = t.width + 30;
      x.stroke();
      x.strokeStyle = '#d9a066';
      x.lineWidth = t.width;
      x.stroke();
      x.restore();
    }

    function drawPreview() {
      const c = $('#tractor-preview');
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const w = c.clientWidth || 260;
      const h = c.clientHeight || 150;
      c.width = w * dpr;
      c.height = h * dpr;
      const x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, w, h);
      const fake = { x: 0, y: 0, z: 0, heading: -0.35, steer: 0.4, color: garage.paintHex(), isPlayer: true, bump: 0, progress: 0, id: 0 };
      x.translate(w / 2, h / 2);
      x.scale(3.6, 3.6);
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.beginPath();
      x.ellipse(3, 6, 22, 15, -0.35, 0, Math.PI * 2);
      x.fill();
      root.TractorRender.drawTractor(x, fake, performance.now());
    }

    garageEl.addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy]');
      const paint = e.target.closest('[data-paint]');
      const track = e.target.closest('[data-track]');
      if (buy) {
        const id = buy.dataset.buy;
        const cost = garage.nextCost(id);
        if (garage.buy(id, wallet)) {
          sound.coins();
          toast(`${UPGRADES.find((u) => u.id === id).name} upgraded to level ${garage.state.upgrades[id]}!`, 'good');
        } else {
          sound.click();
          toast(`You need 🌾${fmt(cost - wallet.balance)} more Hay. Win races, try the mini games, or get free Hay in your wallet.`, 'warn');
        }
        renderGarage();
      } else if (paint) {
        const id = paint.dataset.paint;
        const p = PAINTS.find((x) => x.id === id);
        if (garage.paintOwned(id)) {
          garage.setPaint(id);
          sound.chip();
        } else if (gold && gold.canAfford(p.gold)) {
          if (confirm(`Buy the ${p.name} paint job for 🪙${p.gold} Gold?`)) {
            garage.buyPaint(id, gold);
            sound.fanfare();
            toast(`${p.name} paint applied — looking sharp!`, 'good');
          }
        } else {
          sound.click();
          toast(`${p.name} costs 🪙${p.gold} Gold. Get Gold in the store.`, 'info');
          if (openWallet) openWallet('gold');
        }
        renderGarage();
      } else if (track && !track.disabled) {
        selected = TRACKS.find((t) => t.id === track.dataset.track);
        try {
          localStorage.setItem(SELECTED_KEY, selected.id);
        } catch (err) {
          // Ignore.
        }
        sound.click();
        renderGarage();
      }
    });

    $('#race-btn').addEventListener('click', () => {
      sound.click();
      startRace();
    });
    $('#dock-race').addEventListener('click', () => {
      sound.click();
      startRace();
    });
    $('#dock-track').addEventListener('click', () => {
      sound.click();
      const bar = document.querySelector('.topbar');
      const top = $('.g-tracks').getBoundingClientRect().top + root.scrollY - (bar ? bar.offsetHeight : 0) - 10;
      root.scrollTo({ top, behavior: 'smooth' });
    });

    // ---------- Race ----------

    function showRaceScreen(on) {
      garageEl.classList.toggle('hidden', on);
      raceEl.classList.toggle('hidden', !on);
      document.body.classList.toggle('in-race', on);
    }

    function startRace() {
      const track = getTrack(selected);
      sim = Sim.createRace(track, {
        seed: root.FarmRng.randomSeed(),
        playerUpgrades: garage.state.upgrades,
        playerColor: garage.paintHex(),
        playerLevel: garage.level,
      });
      phase = 'countdown';
      countdown = 3;
      acc = 0;
      banner = null;
      finalLapShown = false;
      lapFlash = null;
      modal.classList.add('hidden');
      showRaceScreen(true);
      raceEl.classList.toggle('chase', viewMode === 'chase');
      renderViewButton();
      layout();
      renderer.setTrack(track);
      renderer.clearSkids();
      stickEnd();
      input.brake = false;
      input.keys.clear();
      sound.beep(false);
      sound.engineStart();
      updateHud();
      // Try to get rid of browser chrome on Android; iOS needs "Add to Home Screen".
      const fs = document.documentElement.requestFullscreen;
      if (fs && !document.fullscreenElement && matchMedia('(pointer: coarse)').matches) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }

    // Which controls to explain: whatever the player last used, defaulting
    // to touch on phones/tablets and keyboard elsewhere.
    let lastInput = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 ? 'touch' : 'keys';
    raceEl.addEventListener('touchstart', () => setInputMode('touch'), { passive: true });
    root.addEventListener('keydown', () => mounted && setInputMode('keys'));
    function setInputMode(mode) {
      if (mode === lastInput) return;
      lastInput = mode;
      updateStickHint();
    }
    function updateStickHint() {
      $('.stick-hint').textContent = lastInput === 'touch' ? 'Slide ← → to steer' : '← → steer · Space nitro · ↓ brake';
    }
    updateStickHint();

    const CONTROLS = {
      touch: {
        title: 'Phone controls',
        rows: [
          ['👆', 'Steer', 'Put your thumb anywhere on the <b>left half</b> of the screen and slide <b>left or right</b>. The further you slide, the harder you turn; let go to go straight.'],
          ['🚜', 'Gas', 'Automatic — you’re always on the throttle.'],
          ['🔥', 'Nitro', 'Tap <b>NITRO</b> for a burst of speed. Counter at the top right.'],
          ['🛑', 'Brake', 'Hold <b>BRAKE</b> to slow down. Keep holding when stopped to reverse out of trouble.'],
          ['⏸️', 'Pause', 'Tap the pause button at the top right.'],
          ['📷', 'Camera', 'Tap the 📷 button at the top of the screen to switch between the close-up camera and the whole track.'],
        ],
        tip: 'Play with your phone sideways. Add the game to your Home Screen for full screen.',
      },
      keys: {
        title: 'Keyboard controls',
        rows: [
          ['<kbd>←</kbd> <kbd>→</kbd>', 'Steer', 'Turn left and right (or <kbd>A</kbd> <kbd>D</kbd>).'],
          ['🚜', 'Gas', 'Automatic — you’re always on the throttle.'],
          ['<kbd>Space</kbd>', 'Nitro', 'Burst of speed (or <kbd>Shift</kbd>). Counter at the top right.'],
          ['<kbd>↓</kbd>', 'Brake', 'Slow down (or <kbd>S</kbd>). Keep holding when stopped to reverse.'],
          ['<kbd>Esc</kbd>', 'Pause', 'Pause and resume (or <kbd>P</kbd>).'],
          ['<kbd>V</kbd>', 'Camera', 'Switch between the close-up camera and the whole track.'],
        ],
        tip: 'You can also click and drag left/right on the left half of the track to steer with the mouse.',
      },
    };
    const TRACK_TIPS = 'Jumps launch you — you can’t steer in the air. Mud and water slow you down. Grab 💰 cash bags for extra credits and red <b>N</b> cans for an extra nitro.';

    function showPauseMenu() {
      modal.innerHTML = `
        <div class="rmodal-card">
          <h2>Paused</h2>
          <button class="btn btn-primary btn-big" data-act="resume">Resume</button>
          <button class="btn btn-ghost" data-act="controls">🎮 Controls</button>
          <button class="btn btn-ghost" data-act="view">${viewMode === 'chase' ? '🗺️ Camera: switch to whole track' : '🔍 Camera: switch to close-up'}</button>
          <button class="btn btn-ghost" data-act="restart">Restart race</button>
          <button class="btn btn-ghost" data-act="quit">Back to garage</button>
          <p class="small">Quitting forfeits this race's prize money.</p>
        </div>`;
    }

    function showControls(mode) {
      const c = CONTROLS[mode];
      const other = mode === 'touch' ? 'keys' : 'touch';
      modal.innerHTML = `
        <div class="rmodal-card controls-card">
          <h2>${c.title}</h2>
          <ul class="controls-list">
            ${c.rows.map(([icon, name, text]) => `<li><span class="c-key">${icon}</span><span><b>${name}</b><small>${text}</small></span></li>`).join('')}
          </ul>
          <p class="c-tip">${c.tip}</p>
          <p class="c-tip">${TRACK_TIPS}</p>
          <div class="r-actions">
            <button class="btn btn-ghost" data-act="pause-menu">← Back</button>
            <button class="btn btn-primary" data-act="resume">Resume</button>
          </div>
          <button class="link-btn" data-act="controls-${other}">Show ${CONTROLS[other].title.toLowerCase()} instead</button>
        </div>`;
    }

    function togglePause() {
      if (phase === 'racing' || phase === 'countdown') {
        phase = { paused: true, resume: phase };
        sound.engineStop();
        stickEnd();
        input.brake = false;
        input.keys.clear();
        showPauseMenu();
        modal.classList.remove('hidden');
      } else if (phase && phase.paused) {
        phase = phase.resume;
        lastNow = 0;
        modal.classList.add('hidden');
        sound.engineStart();
      }
    }

    modal.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      sound.click();
      const act = b.dataset.act;
      if (act === 'double') {
        // Opt-in only: the player chose to watch, and is paid only if they finish it.
        b.disabled = true;
        const extra = lastEarnings ? lastEarnings.total : 0;
        const got = extra ? await watchAdFor('double', extra) : 0;
        if (got) {
          b.outerHTML = `<p class="doubled">✨ Doubled! +🌾${fmt(got)}</p>`;
          $('#r-total').textContent = `🌾 ${fmt(lastEarnings.total + got)}`;
          lastEarnings = null;
        } else {
          b.disabled = false;
        }
        return;
      }
      if (act === 'resume') togglePause();
      else if (act === 'restart' || act === 'again') startRace();
      else if (act === 'quit' || act === 'garage') toGarage();
      else if (act === 'controls') showControls(lastInput);
      else if (act === 'view') {
        setViewMode(viewMode === 'chase' ? 'full' : 'chase');
        showPauseMenu();
      }
      else if (act === 'controls-touch') showControls('touch');
      else if (act === 'controls-keys') showControls('keys');
      else if (act === 'pause-menu') showPauseMenu();
    });

    function toGarage() {
      phase = 'garage';
      sound.engineStop();
      modal.classList.add('hidden');
      showRaceScreen(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      renderGarage();
    }

    function finishRace() {
      phase = 'results';
      sound.engineStop();
      const e = Sim.earnings(sim);
      const me = sim.racers[0];
      lastEarnings = e;
      const award = garage.recordResult(selected.id, e.place, me.finishTime, { fastestLap: e.fastestLap, bestLap: e.bestLap });
      const extras = [e.cash ? `+${e.cash} cash bags` : '', e.fastestLap ? `+${e.lapBonus} fastest lap` : ''].filter(Boolean).join(', ');
      if (e.total > 0) wallet.credit(e.total, `Tractor Rally — ${ordinal(e.place)} at ${selected.name}${extras ? ` (${extras})` : ''}`);
      if (e.place === 1) sound.fanfare();
      else sound.coins();

      const newlyUnlocked = TRACKS.filter((t) => t.unlock && t.unlock.track === selected.id && e.place <= t.unlock.place);
      const order = Sim.standings(sim);
      setTimeout(() => {
        if (phase !== 'results') return;
        modal.innerHTML = `
          <div class="rmodal-card results">
            <div class="place place-${e.place}">${ordinal(e.place)}</div>
            <div class="r-sub">${selected.name}${me.finishTime ? ` · ${fmtTime(me.finishTime)}` : ''}</div>
            <ol class="r-order">${order.map((id) => {
              const r = sim.racers[id];
              return `<li class="${r.isPlayer ? 'me' : ''}"><span class="dot" style="background:${r.color}"></span>${r.name}</li>`;
            }).join('')}</ol>
            <div class="r-money">
              <div><span>${ordinal(e.place)} place prize</span><b>🌾 ${fmt(e.placeReward)}</b></div>
              <div><span>Cash bags</span><b>🌾 ${fmt(e.cash)}</b></div>
              ${e.fastestLap ? `<div><span>Fastest lap bonus</span><b>🌾 ${fmt(e.lapBonus)}</b></div>` : ''}
              <div class="total"><span>Total earned</span><b id="r-total">🌾 ${fmt(e.total)}</b></div>
              ${e.total > 0 && rewards && rewards.adsRemaining() > 0
                ? `<button class="btn btn-ad" data-act="double">📺 Watch an ad to double it (+${fmt(e.total)})</button>`
                : ''}
            </div>
            ${awardsHtml(e, award, newlyUnlocked)}
            <div class="r-actions">
              <button class="btn btn-ghost" data-act="garage">Garage</button>
              <button class="btn btn-primary btn-big" data-act="again">Race again</button>
            </div>
          </div>`;
        modal.classList.remove('hidden');
      }, 1500);
    }

    function awardsHtml(e, award, unlocked = []) {
      const items = [];
      if (award.trophy) {
        items.push(`<div class="award ${award.trophy.id}"><span class="a-icon">${TROPHY_ICON[award.trophy.id]}</span><span><b>${award.trophy.name}</b><small>${award.newBestTrophy ? 'New best on this track!' : 'Added to your cabinet'}</small></span></div>`);
      }
      if (e.fastestLap) {
        items.push(`<div class="award fastest"><span class="a-icon">⏱️</span><span><b>Fastest lap</b><small>${fmtLap(e.raceFastestLap.time)} — quickest in the race</small></span></div>`);
      } else if (e.raceFastestLap) {
        const who = sim.racers[e.raceFastestLap.id].name;
        items.push(`<div class="award miss"><span class="a-icon">⏱️</span><span><b>Fastest lap: ${who}</b><small>${fmtLap(e.raceFastestLap.time)} · yours ${fmtLap(e.bestLap)}</small></span></div>`);
      }
      if (award.lapRecord) {
        items.push(`<div class="award record"><span class="a-icon">📈</span><span><b>Personal best lap</b><small>${fmtLap(e.bestLap)} on ${selected.name}</small></span></div>`);
      }
      for (const t of unlocked) {
        items.push(`<div class="award unlocked"><span class="a-icon">🔓</span><span><b>Track unlocked</b><small>${t.name}</small></span></div>`);
      }
      return items.length ? `<div class="awards">${items.join('')}</div>` : '';
    }

    // ---------- Trophy cabinet ----------

    const cabinet = $('#cabinet');
    function openCabinet() {
      const st = garage.state;
      const tot = garage.awardTotals();
      cabinet.innerHTML = `
        <div class="cabinet-card" role="dialog" aria-label="Trophy cabinet">
          <button class="modal-close" data-close aria-label="Close">✕</button>
          <h2>🏆 Trophy Cabinet</h2>
          <div class="cab-totals">
            <div><span>🥇</span><b>${tot.gold}</b><small>Gold</small></div>
            <div><span>🥈</span><b>${tot.silver}</b><small>Silver</small></div>
            <div><span>🥉</span><b>${tot.bronze}</b><small>Bronze</small></div>
            <div><span>⏱️</span><b>${tot.fastest}</b><small>Fastest laps</small></div>
          </div>
          <p class="cab-sub">${st.races} race${st.races === 1 ? '' : 's'} · ${st.wins} win${st.wins === 1 ? '' : 's'}</p>
          <div class="cab-rows">
            <div class="cab-row head"><span>Track</span><span>Best</span><span>🥇</span><span>🥈</span><span>🥉</span><span>⏱️</span><span>Best lap</span></div>
            ${TRACKS.map((t, i) => {
              const a = st.awards[t.id] || {};
              const b = st.best[t.id];
              const unlocked = garage.isUnlocked(t);
              const bestIcon = b && b.place <= 3 ? TROPHY_ICON[TROPHIES[b.place - 1].id] : b ? ordinal(b.place) : '—';
              return `<div class="cab-row ${unlocked ? '' : 'locked'}">
                <span class="cab-name">${unlocked ? '' : '🔒 '}${i + 1}. ${t.name}</span>
                <span class="cab-best">${bestIcon}</span>
                <span>${a.gold || 0}</span><span>${a.silver || 0}</span><span>${a.bronze || 0}</span><span>${a.fastest || 0}</span>
                <span>${fmtLap(a.bestLap)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      cabinet.classList.remove('hidden');
    }
    $('#garage-record').addEventListener('click', () => {
      sound.click();
      openCabinet();
    });
    cabinet.addEventListener('click', (e) => {
      if (e.target === cabinet || e.target.closest('[data-close]')) cabinet.classList.add('hidden');
    });

    function updateHud() {
      if (!sim) return;
      const me = sim.racers[0];
      const pos = Sim.standings(sim).indexOf(0) + 1;
      $('#hud-pos').innerHTML = `${pos}<small>${ordinal(pos).slice(-2)}</small>`;
      $('#hud-lap').textContent = `LAP ${Math.max(1, Math.min(sim.laps, me.lap))}/${sim.laps}`;
      $('#hud-nitro').textContent = me.nitros ? '🔥'.repeat(Math.min(me.nitros, 6)) + (me.nitros > 6 ? `+${me.nitros - 6}` : '') : '—';
      $('#hud-cash').textContent = `🌾 ${fmt(me.cash)}`;
      const running = me.lapStart != null && !me.finished ? sim.t - me.lapStart : null;
      const best = me.lapTimes.length ? Math.min(...me.lapTimes) : null;
      const timeEl = $('#hud-time');
      if (lapFlash && sim.t - lapFlash.at < 2.5) {
        timeEl.textContent = `⏱ ${fmtLap(lapFlash.time)}${lapFlash.best ? ' BEST!' : ''}`;
        timeEl.classList.toggle('flash', lapFlash.best);
      } else {
        timeEl.textContent = `⏱ ${running == null ? '—' : running.toFixed(1)}${best ? ` · best ${fmtLap(best)}` : ''}`;
        timeEl.classList.remove('flash');
      }
      $('#btn-nitro').classList.toggle('empty', me.nitros === 0);
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
      lastNow = now;
      if (!sim || phase === 'garage') return;

      if (phase === 'countdown') {
        const before = Math.ceil(countdown);
        countdown -= dt;
        if (countdown <= 0) {
          countdown = 0;
          phase = 'racing';
          banner = { text: 'GO!', t: 1 };
          sound.beep(true);
        } else if (Math.ceil(countdown) !== before) {
          sound.beep(false);
        }
      }

      const running = phase === 'racing' || phase === 'results';
      if (running) {
        acc += dt;
        while (acc >= Sim.DT) {
          const inputs = phase === 'racing' && !sim.racers[0].finished ? { 0: playerInput() } : {};
          Sim.step(sim, inputs);
          acc -= Sim.DT;
        }
        handleEvents();
        if (phase === 'racing' && sim.done) finishRace();
        const me = sim.racers[0];
        sound.engineSet(Math.hypot(me.vx, me.vy) / me.stats.topSpeed, me.nitroTime > 0);
        updateHud();
      }
      if (banner) {
        banner.t -= dt * 0.8;
        if (banner.t <= 0) banner = null;
      }

      renderer.draw(sim, {
        running,
        countdown,
        banner,
        showYou: phase === 'countdown' || (phase === 'racing' && sim.t < 2.5),
        finalLap: sim.racers[0].lap === sim.laps,
        chequered: sim.done,
      }, now);
    }

    function handleEvents() {
      if (!sim.events.length) return;
      renderer.addEvents(sim.events, sim);
      for (const e of sim.events) {
        const mine = e.id === 0;
        if (e.type === 'wall' && mine) sound.thud();
        else if (e.type === 'bang') sound.bonk();
        else if (e.type === 'pickup' && mine) e.kind === 'cash' ? sound.coins() : sound.chip();
        else if (e.type === 'nitro' && mine) sound.whoosh();
        else if (e.type === 'jump' && mine) sound.boing();
        else if (e.type === 'lap' && mine) {
          if (e.time != null) {
            const me = sim.racers[0];
            lapFlash = { time: e.time, at: sim.t, best: e.time <= Math.min(...me.lapTimes) && me.lapTimes.length > 1 };
          }
          if (e.lap === sim.laps - 1 && !finalLapShown) {
            finalLapShown = true;
            banner = { text: 'FINAL LAP!', t: 1.4 };
            sound.beep(true);
          }
        } else if (e.type === 'finish' && mine) {
          banner = { text: e.place === 1 ? 'WINNER!' : `${ordinal(e.place).toUpperCase()}!`, t: 1.8 };
        }
      }
      sim.events.length = 0;
    }

    // Read-only peek for automated tests / debugging in the console.
    root.TractorRally.debug = { get sim() { return sim; }, get phase() { return phase; } };

    return {
      mount() {
        mounted = true;
        phase = 'garage';
        const refunded = garage.payRefund(wallet);
        if (refunded) toast(`Suspension upgrades were retired — refunded 🌾${fmt(refunded)}`, 'good', 5000);
        showRaceScreen(false);
        renderGarage();
        lastNow = 0;
        if (!rafId) rafId = requestAnimationFrame(frame);
      },
      unmount() {
        mounted = false;
        sound.engineStop();
        document.body.classList.remove('in-race');
        cancelAnimationFrame(rafId);
        rafId = null;
        phase = 'garage';
      },
      refresh() {
        if (mounted && phase === 'garage') renderGarage();
      },
    };
  }

  root.TractorRally = { createTractorRally };
})(typeof globalThis !== 'undefined' ? globalThis : this);
