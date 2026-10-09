// Tractor Rally — garage UI, race loop, touch/keyboard controls, results.
(function (root) {
  const Sim = root.TractorSim;
  const { TRACKS, WORLD, buildTrack } = root.TractorTracks;
  const { UPGRADES, PAINTS, MAX_LEVEL, createGarage } = root.TractorGarage;
  const SELECTED_KEY = 'farmCasino.tractor.track';

  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
  const fmt = (n) => n.toLocaleString('en-GB');
  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  function createTractorRally({ el, wallet, sound, toast }) {
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
    let mounted = false;

    // ---------- Input ----------

    const input = { stickAngle: null, brake: false, nitro: false, keys: new Set() };

    function playerInput() {
      const me = sim.racers[0];
      let steer = 0;
      const k = input.keys;
      if (k.has('ArrowLeft') || k.has('a')) steer -= 1;
      if (k.has('ArrowRight') || k.has('d')) steer += 1;
      if (steer === 0 && input.stickAngle != null) {
        // Point the stick where you want to go; the tractor turns to face it.
        steer = Math.max(-1, Math.min(1, Sim.angleDiff(input.stickAngle, me.heading) * 2.5));
      }
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
      stickMove(x, y);
    }
    function stickMove(x, y) {
      const dx = x - stickOrigin.x;
      const dy = y - stickOrigin.y;
      const d = Math.hypot(dx, dy);
      const max = 46;
      const k = d > max ? max / d : 1;
      stickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      input.stickAngle = d > 10 ? Math.atan2(dy, dx) : null;
    }
    function stickEnd() {
      stickTouch = null;
      input.stickAngle = null;
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
          stickMove(t.clientX - r.left, t.clientY - r.top);
        }
      }
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickTouch) stickEnd();
    };
    stickZone.addEventListener('touchend', touchEnd);
    stickZone.addEventListener('touchcancel', touchEnd);
    // Mouse fallback so the joystick can be tried on desktop too.
    stickZone.addEventListener('mousedown', (e) => {
      const r = stickZone.getBoundingClientRect();
      stickStart('mouse', e.clientX - r.left, e.clientY - r.top);
    });
    root.addEventListener('mousemove', (e) => {
      if (stickTouch !== 'mouse') return;
      const r = stickZone.getBoundingClientRect();
      stickMove(e.clientX - r.left, e.clientY - r.top);
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
      input.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    root.addEventListener('keyup', (e) => input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (phase === 'racing' || phase === 'countdown')) togglePause();
    });

    $('#btn-pause').addEventListener('click', togglePause);

    // ---------- Layout ----------

    function layout() {
      if (phase === 'garage') return;
      const vw = root.innerWidth;
      const vh = root.innerHeight;
      const k = Math.min(vw / WORLD.width, vh / WORLD.height);
      renderer.resize(Math.floor(WORLD.width * k), Math.floor(WORLD.height * k));
      raceEl.classList.toggle('portrait', vh > vw);
    }
    root.addEventListener('resize', () => mounted && layout());
    root.addEventListener('orientationchange', () => setTimeout(() => mounted && layout(), 200));

    // ---------- Garage ----------

    function renderGarage() {
      const st = garage.state;
      $('#garage-record').textContent = `${st.wins} win${st.wins === 1 ? '' : 's'} · ${st.races} race${st.races === 1 ? '' : 's'}`;

      $('#paints').innerHTML = PAINTS.map((p) =>
        `<button class="paint ${st.paint === p.id ? 'active' : ''}" data-paint="${p.id}" style="--paint:${p.hex}" title="${p.name}" aria-label="${p.name} paint"></button>`).join('');

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
        const need = t.unlock && TRACKS.find((x) => x.id === t.unlock.track);
        return `<button class="track ${selected.id === t.id ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-track="${t.id}" ${unlocked ? '' : 'disabled'}>
          <canvas class="track-thumb" data-thumb="${t.id}" width="120" height="68"></canvas>
          <span class="t-info">
            <b>${unlocked ? '' : '🔒 '}${t.name}</b>
            <small>${unlocked ? t.blurb : `Finish ${ordinal(t.unlock.place)} or better on ${need.name} to unlock`}</small>
            <small class="t-meta">#${TRACKS.indexOf(t) + 1} · ${t.laps} laps · 1st pays 🌾${fmt(t.reward[0])}${best ? ` · Best: ${ordinal(best.place)}${best.time ? ` in ${fmtTime(best.time)}` : ''}` : ''}</small>
          </span>
        </button>`;
      }).join('');
      el.querySelectorAll('[data-thumb]').forEach((c) => drawThumb(c, getTrack(TRACKS.find((t) => t.id === c.dataset.thumb))));
      const active = $('#track-list .track.active');
      const list = $('#track-list');
      if (active && list.scrollTop === 0) list.scrollTop = Math.max(0, active.offsetTop - list.offsetTop - 8);

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
          toast(`You need 🌾${fmt(cost - wallet.balance)} more credits. Try the Hay Bale Derby!`, 'warn');
        }
        renderGarage();
      } else if (paint) {
        garage.setPaint(paint.dataset.paint);
        sound.chip();
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
      modal.classList.add('hidden');
      showRaceScreen(true);
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
      $('.stick-hint').textContent = lastInput === 'touch' ? 'Drag here to steer' : '← → steer · Space nitro · ↓ brake';
    }
    updateStickHint();

    const CONTROLS = {
      touch: {
        title: 'Phone controls',
        rows: [
          ['👆', 'Steer', 'Drag anywhere on the <b>left half</b> of the screen. Point the stick where you want to go and the tractor turns to face that way.'],
          ['🚜', 'Gas', 'Automatic — you’re always on the throttle.'],
          ['🔥', 'Nitro', 'Tap <b>NITRO</b> for a burst of speed. Counter at the top right.'],
          ['🛑', 'Brake', 'Hold <b>BRAKE</b> to slow down. Keep holding when stopped to reverse out of trouble.'],
          ['⏸️', 'Pause', 'Tap the pause button at the top right.'],
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
        ],
        tip: 'You can also click and drag on the left half of the track to steer with the mouse.',
      },
    };
    const TRACK_TIPS = 'Jumps launch you — you can’t steer in the air. Mud and water slow you down. Grab 💰 cash bags for extra credits and red <b>N</b> cans for an extra nitro.';

    function showPauseMenu() {
      modal.innerHTML = `
        <div class="rmodal-card">
          <h2>Paused</h2>
          <button class="btn btn-primary btn-big" data-act="resume">Resume</button>
          <button class="btn btn-ghost" data-act="controls">🎮 Controls</button>
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

    modal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      sound.click();
      const act = b.dataset.act;
      if (act === 'resume') togglePause();
      else if (act === 'restart' || act === 'again') startRace();
      else if (act === 'quit' || act === 'garage') toGarage();
      else if (act === 'controls') showControls(lastInput);
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
      garage.recordResult(selected.id, e.place, me.finishTime);
      if (e.total > 0) wallet.credit(e.total, `Tractor Rally — ${ordinal(e.place)} at ${selected.name}${e.cash ? ` (+${e.cash} cash bags)` : ''}`);
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
              <div class="total"><span>Total earned</span><b>🌾 ${fmt(e.total)}</b></div>
            </div>
            ${newlyUnlocked.length ? `<p class="unlock">🔓 Unlocked: ${newlyUnlocked.map((t) => t.name).join(', ')}</p>` : ''}
            <div class="r-actions">
              <button class="btn btn-ghost" data-act="garage">Garage</button>
              <button class="btn btn-primary btn-big" data-act="again">Race again</button>
            </div>
          </div>`;
        modal.classList.remove('hidden');
      }, 1500);
    }

    function updateHud() {
      if (!sim) return;
      const me = sim.racers[0];
      const pos = Sim.standings(sim).indexOf(0) + 1;
      $('#hud-pos').innerHTML = `${pos}<small>${ordinal(pos).slice(-2)}</small>`;
      $('#hud-lap').textContent = `LAP ${Math.max(1, Math.min(sim.laps, me.lap))}/${sim.laps}`;
      $('#hud-nitro').textContent = me.nitros ? '🔥'.repeat(Math.min(me.nitros, 6)) + (me.nitros > 6 ? `+${me.nitros - 6}` : '') : '—';
      $('#hud-cash').textContent = `🌾 ${fmt(me.cash)}`;
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
