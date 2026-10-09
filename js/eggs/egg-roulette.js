// Egg Roulette — UI: the hen runs round the nests, slows, and lays an egg.
(function (root) {
  const E = root.EggRoulette;
  const CHIPS = [5, 10, 25, 50, 100];
  const HISTORY_KEY = 'farmCasino.eggs.history';
  const SIZE = 520;
  const RING_R = 190;
  const OUTLINE = '#3b2a14';
  const FONT = '"Lilita One", "Arial Black", sans-serif';
  const fmt = (n) => n.toLocaleString('en-GB');
  const TAU = Math.PI * 2;

  const nestAngle = (n) => -Math.PI / 2 + (E.RING.indexOf(n) / E.RING.length) * TAU;
  const EGG_COLORS = { gold: '#ffd23f', brown: '#c98a4b', white: '#fffaf0' };

  function createEggRoulette({ el, wallet, sound, toast }) {
    const $ = (sel) => el.querySelector(sel);
    const canvas = $('#egg-canvas');
    const ctx = canvas.getContext('2d');
    const board = $('#egg-board');
    const layBtn = $('#egg-lay');
    const msgEl = $('#egg-msg');

    let chip = 10;
    let bets = {};
    let undo = [];
    let busy = false;
    let mounted = false;
    let rafId = null;
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
      history = [];
    }

    // Hen animation state.
    const hen = { angle: -Math.PI / 2 - 0.3, phase: 0, mode: 'idle', sitT: 0 };
    let run = null; // { from, to, start, dur }
    let laid = null; // { nest, t }
    let winners = [];

    // ---------- Board ----------

    function renderBoard() {
      const nestBtn = (n) => {
        const c = E.colorOf(n);
        return `<button class="egg-bet nest ${c} ${winners.includes(`n${n}`) ? 'won' : ''}" data-bet="n${n}">
          <span class="egg-num">${n}</span>${stakeBadge(`n${n}`)}</button>`;
      };
      const outBtn = (id, extra = '') => {
        const spec = E.betSpec(id);
        return `<button class="egg-bet outside ${extra} ${winners.includes(id) ? 'won' : ''}" data-bet="${id}">
          <span>${spec.label}</span><small>pays ${spec.pays}×</small>${stakeBadge(id)}</button>`;
      };
      board.innerHTML = `
        <div class="egg-grid">
          <div class="egg-zero">${nestBtn(0)}</div>
          ${[0, 1, 2].map((row) => `
            ${[1, 2, 3, 4].map((k) => nestBtn(row * 4 + k)).join('')}
            ${outBtn(['coopA', 'coopB', 'coopC'][row], 'coop')}`).join('')}
        </div>
        <div class="egg-outside">
          ${outBtn('brown', 'brown')}${outBtn('white', 'white')}${outBtn('odd')}${outBtn('even')}${outBtn('low')}${outBtn('high')}
        </div>`;
      const total = totalBet();
      $('#egg-total').textContent = fmt(total);
      layBtn.disabled = busy || total === 0;
      layBtn.textContent = busy ? 'Laying…' : total ? `Lay an egg! (${fmt(total)})` : 'Place a bet';
      $('#egg-undo').disabled = busy || !undo.length;
      $('#egg-clear').disabled = busy || total === 0;
      $('#egg-chips').querySelectorAll('[data-chip]').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.chip) === chip);
        b.disabled = busy;
      });
      $('#egg-history').innerHTML = history.length
        ? history.map((n) => `<span class="h-egg ${E.colorOf(n)}" title="Nest ${n}">${n}</span>`).join('')
        : '<small>No eggs yet</small>';
    }

    function stakeBadge(id) {
      return bets[id] ? `<span class="stake-badge">${fmt(bets[id])}</span>` : '';
    }

    function totalBet() {
      return Object.values(bets).reduce((a, b) => a + b, 0);
    }

    $('#egg-chips').innerHTML = CHIPS.map((c) => `<button class="chip" data-chip="${c}" aria-label="${c} credit chip">${c}</button>`).join('');
    $('#egg-chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b || busy) return;
      chip = Number(b.dataset.chip);
      sound.chip();
      renderBoard();
    });

    board.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bet]');
      if (!b || busy) return;
      if (totalBet() + chip > wallet.balance) {
        toast('Not enough Hay for that chip. Get free Hay in your wallet: daily bonus or a short ad.', 'warn');
        return;
      }
      const id = b.dataset.bet;
      bets[id] = (bets[id] || 0) + chip;
      undo.push([id, chip]);
      winners = [];
      sound.chip();
      renderBoard();
    });

    $('#egg-undo').addEventListener('click', () => {
      const last = undo.pop();
      if (!last || busy) return;
      const [id, amt] = last;
      bets[id] -= amt;
      if (bets[id] <= 0) delete bets[id];
      sound.click();
      renderBoard();
    });
    $('#egg-clear').addEventListener('click', () => {
      if (busy) return;
      bets = {};
      undo = [];
      winners = [];
      sound.click();
      renderBoard();
    });
    layBtn.addEventListener('click', lay);

    // ---------- Round ----------

    function lay() {
      const total = totalBet();
      if (busy || !total) return;
      if (!wallet.canAfford(total)) {
        toast('Not enough credits for these bets.', 'warn');
        return;
      }
      busy = true;
      winners = [];
      laid = null;
      wallet.spend(total, `Egg Roulette — ${Object.entries(bets).map(([id, v]) => `${E.betSpec(id).label} ${v}`).join(', ')}`);
      const nest = E.roll(root.FarmRng.mulberry32(root.FarmRng.randomSeed()));
      const result = E.settle(bets, nest);
      if (result.payout > 0) root.FarmPending.save('eggs', result.payout, `Egg Roulette — nest ${nest} came up`);

      // Run at least three laps then pull up on the chosen nest.
      const from = hen.angle;
      let to = nestAngle(nest);
      while (to < from + TAU * 3) to += TAU;
      run = { from, to, start: performance.now(), dur: 4200 + Math.random() * 800, nest, result };
      hen.mode = 'run';
      msgEl.textContent = 'She’s off! Where will she lay?';
      sound.animal('chicken');
      renderBoard();
    }

    function finishRound() {
      const { nest, result } = run;
      run = null;
      busy = false;
      winners = result.winners;
      history = [nest, ...history].slice(0, 12);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch (e) {
        // Ignore.
      }
      const color = E.colorOf(nest);
      const name = nest === 0 ? 'the GOLDEN nest' : `nest ${nest} (${color})`;
      if (result.payout > 0) {
        wallet.credit(result.payout, `Egg Roulette — nest ${nest} came up`);
        root.FarmPending.clear('eggs');
        msgEl.innerHTML = `Egg in ${name}! You win <b>🌾 ${fmt(result.payout)}</b>`;
        if (result.payout >= totalBet() * 3) sound.fanfare();
        else sound.coins();
      } else {
        msgEl.textContent = `Egg in ${name}. No luck this time.`;
        sound.womp();
      }
      renderBoard();
    }

    // ---------- Drawing ----------

    function resize() {
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || SIZE;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const k = canvas.width / SIZE;
      ctx.setTransform(k, 0, 0, k, 0, 0);

      if (run) {
        const t = Math.min(1, (now - run.start) / run.dur);
        const eased = 1 - Math.pow(1 - t, 3);
        const prev = hen.angle;
        hen.angle = run.from + (run.to - run.from) * eased;
        hen.phase += (hen.angle - prev) * 18;
        if (t >= 1 && hen.mode === 'run') {
          hen.mode = 'sit';
          hen.sitT = now;
          sound.animal('chicken');
        }
        if (hen.mode === 'sit' && now - hen.sitT > 900 && !laid) {
          laid = { nest: run.nest, t: now };
          sound.boing();
        }
        if (laid && now - laid.t > 600 && run) finishRound();
      } else if (hen.mode !== 'idle' && laid && now - laid.t > 1400) {
        hen.mode = 'idle';
      }
      draw(now);
    }

    function draw(now) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      // Straw-covered yard.
      const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 40, SIZE / 2, SIZE / 2, SIZE / 2);
      g.addColorStop(0, '#f2d48a');
      g.addColorStop(1, '#d9b066');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#8a5a2b';
      ctx.stroke();
      // Running track.
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, RING_R, 0, TAU);
      ctx.lineWidth = 62;
      ctx.strokeStyle = 'rgba(160, 110, 50, 0.25)';
      ctx.stroke();

      // Coop in the middle.
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-62, -50, 130, 110);
      roundRect(-66, -56, 132, 112, 8);
      fill('#d8432f');
      ctx.fillStyle = '#e95a46';
      ctx.fillRect(-62, -52, 124, 50);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.5;
      for (let x = -54; x < 66; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, -54);
        ctx.lineTo(x, 54);
        ctx.stroke();
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-66, 0);
      ctx.lineTo(66, 0);
      ctx.stroke();
      ctx.fillStyle = '#fff8e6';
      ctx.font = `20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText('EGG', 0, -26);
      ctx.fillText('EGG', 0, -26);
      ctx.strokeText('ROULETTE', 0, 28);
      ctx.fillText('ROULETTE', 0, 28);
      ctx.restore();

      // Nests.
      for (const n of E.RING) {
        const a = nestAngle(n);
        const x = SIZE / 2 + Math.cos(a) * RING_R;
        const y = SIZE / 2 + Math.sin(a) * RING_R;
        const won = laid && laid.nest === n;
        drawNest(x, y, n, won, now);
        // Number tag outside the ring.
        const tx = SIZE / 2 + Math.cos(a) * (RING_R + 50);
        const ty = SIZE / 2 + Math.sin(a) * (RING_R + 50);
        ctx.beginPath();
        ctx.arc(tx, ty, 15, 0, TAU);
        fill(n === 0 ? '#ffd23f' : E.colorOf(n) === 'brown' ? '#a8692f' : '#fffaf0', 2.5);
        ctx.fillStyle = E.colorOf(n) === 'brown' ? '#fff' : OUTLINE;
        ctx.font = `16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), tx, ty + 1);
      }

      drawHen(now);
    }

    function drawNest(x, y, n, won, now) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.arc(2, 3, 26, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, TAU);
      fill(n === 0 ? '#e9b730' : '#b07a3a', 2.5);
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.fillStyle = n === 0 ? '#c99412' : '#7d5326';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 230, 160, 0.6)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.beginPath();
        ctx.arc(0, 0, 20, a, a + 0.5);
        ctx.stroke();
      }
      if (won && hen.mode !== 'sit') {
        const pop = Math.min(1, (now - laid.t) / 250);
        ctx.scale(pop, pop);
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 13, 0, 0, TAU);
        fill(EGG_COLORS[E.colorOf(n)], 2);
        ctx.beginPath();
        ctx.ellipse(-3, -4, 3, 4, 0, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
        // Sparkle ring.
        ctx.strokeStyle = `rgba(255, 215, 60, ${0.5 + 0.5 * Math.sin(now / 120)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Top-down hen, facing +x, scaled up.
    function drawHen(now) {
      const sitting = hen.mode === 'sit';
      let a = hen.angle;
      let r = RING_R;
      if (hen.mode === 'idle' && laid) {
        // Step off the nest so the egg shows.
        r = RING_R - 46;
      }
      const x = SIZE / 2 + Math.cos(a) * r;
      const y = SIZE / 2 + Math.sin(a) * r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      const s = sitting ? 2.1 + Math.sin(now / 90) * 0.05 : 1.9;
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.ellipse(2, 3, 13, 10, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fill();
      if (!sitting) {
        ctx.strokeStyle = '#f39a1e';
        ctx.lineWidth = 2;
        for (const side of [-1, 1]) {
          const off = Math.sin(hen.phase + (side > 0 ? Math.PI : 0)) * 4;
          ctx.beginPath();
          ctx.moveTo(0, side * 4);
          ctx.lineTo(4 + off, side * 6);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-17, -6);
      ctx.lineTo(-14, 0);
      ctx.lineTo(-17, 6);
      ctx.closePath();
      fill('#c46a2c', 1.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, sitting ? 11 : 9.5, 0, 0, TAU);
      fill('#d9823f', 2);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-2, side * 7, 7, 3, side * 0.2, 0, TAU);
        fill('#b5622a', 1.2);
      }
      const peck = hen.mode === 'idle' ? Math.max(0, Math.sin(now / 140)) * 2 : 0;
      const hx = 11 + peck;
      ctx.beginPath();
      ctx.arc(hx, 0, 6, 0, TAU);
      fill('#d9823f', 1.8);
      ctx.fillStyle = '#e8302a';
      for (const cx of [hx - 3, hx, hx + 3]) {
        ctx.beginPath();
        ctx.arc(cx, 0, 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(hx + 5, -2.5);
      ctx.lineTo(hx + 10, 0);
      ctx.lineTo(hx + 5, 2.5);
      ctx.closePath();
      fill('#f7a325', 1);
      ctx.fillStyle = '#111';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx + 2, side * 3.5, 1.3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function fill(color, lw = 2.5) {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    root.addEventListener('resize', () => mounted && resize());

    return {
      mount() {
        mounted = true;
        const back = root.FarmPending.recover('eggs', wallet);
        if (back) toast(`Your last egg paid 🌾${fmt(back)} — credited.`, 'good');
        resize();
        renderBoard();
        if (!rafId) rafId = requestAnimationFrame(frame);
      },
      unmount() {
        // A round in progress settles immediately rather than being lost.
        if (run) {
          laid = { nest: run.nest, t: performance.now() };
          finishRound();
          hen.angle = nestAngle(laid.nest);
          hen.mode = 'idle';
        }
        mounted = false;
        cancelAnimationFrame(rafId);
        rafId = null;
      },
    };
  }

  root.EggRouletteGame = { createEggRoulette };
})(typeof globalThis !== 'undefined' ? globalThis : this);
