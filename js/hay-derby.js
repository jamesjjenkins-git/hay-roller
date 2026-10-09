// Hay Bale Derby — betting flow, game loop and DOM wiring.
(function (root) {
  const Sim = root.HaySim;
  const PENDING_KEY = 'farmCasino.hayDerby.pending';
  const RACE_NO_KEY = 'farmCasino.hayDerby.raceNo';
  const CHIPS = [5, 10, 25, 50, 100, 250];
  const COUNTDOWN = 3;

  function readJSON(key) {
    try {
      return JSON.parse(root.localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      if (value == null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Storage unavailable: the race still works, it just can't be recovered.
    }
  }

  function fmt(n) {
    return n.toLocaleString('en-GB');
  }

  function oddsLabel(o) {
    return `${o % 1 === 0 ? o : o.toFixed(1)}×`;
  }

  function statPips(value, min, max) {
    const n = Math.max(1, Math.min(5, Math.round(1 + ((value - min) / (max - min)) * 4)));
    return '●'.repeat(n) + '<span class="pip-off">' + '●'.repeat(5 - n) + '</span>';
  }

  function createHayDerby({ el, wallet, sound, toast, openWallet }) {
    const $ = (sel) => el.querySelector(sel);
    const canvas = $('#race-canvas');
    const overlay = $('#race-overlay');
    const board = $('#bet-board');
    const chipRow = $('#chip-row');
    const startBtn = $('#start-race');
    const clearBtn = $('#clear-bets');
    const totalEl = $('#bet-total');
    const afterEl = $('#bet-after');
    const raceNoEl = $('#race-no');
    const liveEl = $('#live-positions');
    const statusEl = $('#race-status');

    const renderer = root.HayRender.createRenderer(canvas);

    let raceNo = Number(readJSON(RACE_NO_KEY)) || 1;
    let chip = 10;
    let field = null;
    let odds = null;
    let bets = [];
    let lockedBets = null;
    let sim = null;
    let phase = 'idle'; // idle | pricing | betting | countdown | racing | finished
    let countdown = 0;
    let goFlash = 0;
    let acc = 0;
    let rafId = null;
    let lastNow = 0;
    let lastLive = 0;
    let pricingTimer = null;
    let finishedAt = 0;
    let mounted = false;

    // ---------- Setup ----------

    chipRow.innerHTML = CHIPS.map((c) => `<button class="chip" data-chip="${c}" aria-label="${c} credit chip">${c}</button>`).join('');
    chipRow.addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      chip = Number(b.dataset.chip);
      sound.chip();
      renderChips();
    });

    board.addEventListener('click', (e) => {
      if (phase !== 'betting') return;
      const minus = e.target.closest('[data-minus]');
      const card = e.target.closest('[data-lane]');
      if (!card) return;
      const lane = Number(card.dataset.lane);
      if (minus) {
        bets[lane] = Math.max(0, bets[lane] - chip);
        sound.click();
      } else {
        const total = totalBet();
        if (total + chip > wallet.balance) {
          toast(wallet.balance - total > 0 ? `Only ${fmt(wallet.balance - total)} credits left to bet` : 'Not enough Hay. Get free Hay in your wallet: daily bonus or a short ad.', 'warn');
          return;
        }
        bets[lane] += chip;
        sound.chip();
      }
      renderBoard();
    });

    board.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-lane]')) {
        e.preventDefault();
        e.target.click();
      }
    });

    clearBtn.addEventListener('click', () => {
      if (phase !== 'betting') return;
      bets = bets.map(() => 0);
      sound.click();
      renderBoard();
    });

    startBtn.addEventListener('click', () => {
      if (phase === 'betting') startRace();
    });

    wallet.subscribe(() => mounted && renderBoard());

    root.addEventListener('resize', () => mounted && renderer.resize());

    // ---------- Race lifecycle ----------

    function newRace() {
      const fieldSeed = root.FarmRng.randomSeed();
      field = Sim.generateField(fieldSeed);
      odds = null;
      bets = field.map(() => 0);
      lockedBets = null;
      sim = Sim.createRace(field, fieldSeed); // static preview at the start line
      phase = 'pricing';
      overlay.innerHTML = '';
      overlay.classList.remove('show');
      raceNoEl.textContent = `Race #${raceNo}`;
      renderer.reset();
      renderBoard();
      renderLive();

      // Price the field in small batches so the page stays responsive.
      const est = Sim.createOddsEstimator(field, fieldSeed ^ 0x9e3779b9);
      clearTimeout(pricingTimer);
      const tick = () => {
        if (est.run(25)) {
          odds = est.result();
          phase = 'betting';
          renderBoard();
        } else {
          statusEl.textContent = `The bookie is checking the bales… ${Math.round(est.progress * 100)}%`;
          pricingTimer = setTimeout(tick, 0);
        }
      };
      tick();
    }

    function totalBet() {
      return bets.reduce((s, b) => s + b, 0);
    }

    function startRace() {
      const total = totalBet();
      if (total > wallet.balance) {
        toast('Not enough credits for those bets', 'warn');
        return;
      }
      if (total > 0) {
        const desc = bets.map((b, i) => (b ? `#${i + 1} ${field[i].name} ${b}` : null)).filter(Boolean).join(', ');
        wallet.spend(total, `Hay Bale Derby #${raceNo} — ${desc}`);
      }
      lockedBets = bets.slice();
      const raceSeed = root.FarmRng.randomSeed();
      writeJSON(PENDING_KEY, { raceNo, field, odds, bets: lockedBets, raceSeed });
      sim = Sim.createRace(field, raceSeed);
      phase = 'countdown';
      countdown = COUNTDOWN;
      acc = 0;
      sound.beep(false);
      renderBoard();
    }

    function settle(result, quiet) {
      const winner = result.finishOrder[0];
      const stake = lockedBets.reduce((s, b) => s + b, 0);
      const won = Sim.payout(lockedBets, odds, winner);
      if (won > 0) {
        wallet.credit(won, `Hay Bale Derby #${raceNo} — #${winner + 1} ${field[winner].name} won @ ${oddsLabel(odds[winner].odds)}`);
      }
      writeJSON(PENDING_KEY, null);
      const summary = { raceNo, winner, stake, won, order: result.finishOrder.slice() };
      raceNo++;
      writeJSON(RACE_NO_KEY, raceNo);
      if (!quiet) {
        if (won > 0) {
          sound.fanfare();
          setTimeout(() => sound.coins(), 600);
        } else if (stake > 0) {
          sound.womp();
        } else {
          sound.fanfare();
        }
      }
      return summary;
    }

    function finishRace() {
      phase = 'finished';
      finishedAt = performance.now();
      const summary = settle(sim, false);
      renderBoard();
      renderLive();
      setTimeout(() => showResults(summary), 1400);
    }

    function showResults({ raceNo: n, winner, stake, won, order }) {
      if (!mounted) return;
      const w = field[winner];
      let verdict;
      if (won > 0) verdict = `<div class="verdict win">You won <b>${fmt(won)}</b> credits!</div>`;
      else if (stake > 0) verdict = `<div class="verdict lose">No luck this time — lost ${fmt(stake)} credits.</div>`;
      else verdict = `<div class="verdict">Just watching? Place a bet next race!</div>`;

      overlay.innerHTML = `
        <div class="results-card">
          <div class="results-title">Race #${n} result</div>
          <div class="winner" style="--lane:${w.color}">
            <span class="ball">${w.number}</span>
            <span><small>Winner</small>${w.name}</span>
            <span class="odds-tag">${oddsLabel(odds[winner].odds)}</span>
          </div>
          ${verdict}
          <ol class="placings">
            ${order.map((lane) => {
              const f = field[lane];
              const bet = lockedBets[lane] ? `<em>your bet ${fmt(lockedBets[lane])}</em>` : '';
              return `<li style="--lane:${f.color}"><span class="ball sm">${f.number}</span>${f.name}${bet}</li>`;
            }).join('')}
          </ol>
          <button class="btn btn-primary" id="next-race">Next race →</button>
        </div>`;
      overlay.classList.add('show');
      overlay.querySelector('#next-race').addEventListener('click', () => {
        sound.click();
        newRace();
      });
    }

    // If the page was closed mid-race, replay that race from its seed and pay out.
    function recoverPending() {
      const p = readJSON(PENDING_KEY);
      if (!p || !Array.isArray(p.field) || !Array.isArray(p.bets) || !Array.isArray(p.odds)) return;
      field = p.field;
      odds = p.odds;
      lockedBets = p.bets;
      raceNo = p.raceNo;
      const result = Sim.runToEnd(field, p.raceSeed);
      const s = settle(result, true);
      const w = field[s.winner];
      toast(
        `Unfinished race #${s.raceNo} was completed: #${w.number} ${w.name} won.` +
          (s.won > 0 ? ` You won ${fmt(s.won)} credits!` : s.stake > 0 ? ' Your bet lost.' : ''),
        s.won > 0 ? 'good' : 'info',
        6000,
      );
    }

    // ---------- Loop ----------

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
      lastNow = now;

      if (phase === 'countdown') {
        const before = Math.ceil(countdown);
        countdown -= dt;
        if (countdown <= 0) {
          phase = 'racing';
          goFlash = 1;
          sound.beep(true);
        } else if (Math.ceil(countdown) !== before) {
          sound.beep(false);
        }
      }

      if (phase === 'racing' || phase === 'finished') {
        goFlash = Math.max(0, goFlash - dt * 1.5);
        acc += dt;
        // Stop simulating a few seconds after the finish so things settle.
        const coasting = phase === 'finished' && now - finishedAt > 6000;
        while (!coasting && acc >= Sim.DT) {
          Sim.step(sim);
          acc -= Sim.DT;
        }
        if (coasting) acc = 0;
        if (sim.events.length) {
          renderer.addEvents(sim.events, sim);
          let bonked = false;
          for (const e of sim.events) {
            if (e.type === 'hit') {
              if (!bonked) sound.bonk();
              bonked = true;
              sound.animal(e.kind);
            }
          }
          sim.events.length = 0;
        }
        if (phase === 'racing' && sim.done) finishRace();
        if (phase === 'racing' && now - lastLive > 150) {
          lastLive = now;
          renderLive();
        }
      }

      const myLanes = new Set();
      (lockedBets || bets).forEach((b, i) => b > 0 && myLanes.add(i));
      renderer.draw(sim, { phase, countdown, goFlash, myLanes }, now);
    }

    // ---------- DOM rendering ----------

    function renderChips() {
      chipRow.querySelectorAll('[data-chip]').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.chip) === chip);
        b.disabled = phase !== 'betting';
      });
    }

    function renderBoard() {
      if (!field) return;
      const betting = phase === 'betting';
      const shown = lockedBets || bets;
      const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#bet-board [data-lane]');
      const focusLane = focused ? focused.dataset.lane : null;
      board.innerHTML = field.map((f, i) => {
        const o = odds ? odds[i].odds : null;
        const stake = shown[i];
        const returns = o && stake ? Math.floor(stake * o) : 0;
        return `
          <div class="bale-card ${stake ? 'has-bet' : ''} ${betting ? '' : 'locked'}" data-lane="${i}" style="--lane:${f.color}" role="button" tabindex="0"
               aria-label="Bet ${chip} on number ${f.number} ${f.name}">
            <div class="bale-head">
              <span class="ball">${f.number}</span>
              <span class="bale-name">${f.name}</span>
              <span class="odds">${o ? oddsLabel(o) : '…'}</span>
            </div>
            <div class="stats">
              <span>Speed</span><span class="pips">${statPips(f.topSpeed, 87, 94)}</span>
              <span>Kick</span><span class="pips">${statPips(f.power, 0.8, 1.2)}</span>
              <span>Steady</span><span class="pips">${statPips(f.stability, 0.3, 1)}</span>
            </div>
            <div class="bet-line">
              ${stake ? `<span class="stake">Bet ${fmt(stake)}</span><span class="returns">pays ${fmt(returns)}</span>` : `<span class="hint">${betting ? `Tap to bet ${chip}` : 'No bet'}</span>`}
              ${stake && betting ? '<button class="minus" data-minus aria-label="Remove chip">−</button>' : ''}
            </div>
          </div>`;
      }).join('');
      if (focusLane != null) board.querySelector(`[data-lane="${focusLane}"]`).focus();

      const total = totalBet();
      totalEl.textContent = fmt(lockedBets ? lockedBets.reduce((s, b) => s + b, 0) : total);
      afterEl.textContent = fmt(Math.max(0, wallet.balance - (lockedBets ? 0 : total)));
      clearBtn.disabled = !betting || total === 0;
      startBtn.disabled = !betting;
      startBtn.textContent = total > 0 ? `Roll 'em! (${fmt(total)})` : 'Watch race';

      if (phase === 'pricing') {
        // statusEl is updated by the pricing loop.
      } else if (betting) {
        statusEl.textContent = wallet.balance === 0 && total === 0
          ? 'Your wallet is empty — add some free credits to play.'
          : 'Pick a chip, then tap a bale to back it. Odds pay out on the winner.';
      } else if (phase === 'countdown' || phase === 'racing') {
        statusEl.textContent = 'And they’re off down the hill! Watch out for the livestock…';
      } else if (phase === 'finished') {
        statusEl.textContent = 'Race over!';
      }
      renderChips();
    }

    function renderLive() {
      if (!sim) return;
      const order = Sim.leaderboard(sim);
      liveEl.innerHTML = order.map((lane, i) => {
        const f = field[lane];
        const b = sim.bales[lane];
        const mine = (lockedBets || bets)[lane] > 0;
        return `<li class="${mine ? 'mine' : ''}" style="--lane:${f.color}">
          <span class="pos">${i + 1}</span><span class="ball sm">${f.number}</span>
          <span class="nm">${f.name}</span>${b.hits ? `<span class="hits" title="Animal collisions">💥${b.hits}</span>` : ''}</li>`;
      }).join('');
    }

    // ---------- Public ----------

    return {
      mount() {
        mounted = true;
        renderer.resize();
        if (!field) {
          recoverPending();
          newRace();
        } else {
          renderBoard();
        }
        lastNow = 0;
        if (!rafId) rafId = requestAnimationFrame(frame);
      },
      // Leaving mid-race resolves it instantly so no bet is ever left hanging.
      unmount() {
        if (phase === 'countdown' || phase === 'racing') {
          Sim.finish(sim);
          const s = settle(sim, true);
          const w = field[s.winner];
          toast(`Race #${s.raceNo} finished without you: #${w.number} ${w.name} won.` + (s.won > 0 ? ` You won ${fmt(s.won)} credits!` : ''), 'info', 5000);
          field = null;
        } else if (phase === 'finished') {
          field = null;
        }
        mounted = false;
        cancelAnimationFrame(rafId);
        rafId = null;
        clearTimeout(pricingTimer);
        if (phase === 'pricing') field = null;
      },
    };
  }

  root.HayDerby = { createHayDerby };
})(typeof globalThis !== 'undefined' ? globalThis : this);
