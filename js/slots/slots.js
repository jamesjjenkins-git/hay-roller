// Piggy Bank Slots — UI: spinning reels, bet selector, paytable, payouts.
(function (root) {
  const L = root.PiggySlots;
  const BETS = [5, 10, 25, 50, 100];
  const BET_KEY = 'farmCasino.slots.bet';
  const CYCLES = 8; // strip copies rendered per reel
  const fmt = (n) => n.toLocaleString('en-GB');

  function createSlots({ el, wallet, sound, toast }) {
    const $ = (sel) => el.querySelector(sel);
    const reels = [...el.querySelectorAll('.reel-strip')];
    const spinBtn = $('#slots-spin');
    const betEl = $('#slots-bet');
    const winEl = $('#slots-win');
    const msgEl = $('#slots-msg');
    const machine = $('.slot-machine');
    let betIdx = Math.max(0, BETS.indexOf(Number(localStorage.getItem(BET_KEY)) || 10));
    let stops = [0, 7, 14];
    let spinning = false;
    let mounted = false;

    // Render each reel as the strip repeated several times.
    const cell = (sym) => `<div class="reel-cell" data-sym="${sym}">${L.SYMBOLS[sym].icon}</div>`;
    for (const r of reels) r.innerHTML = Array.from({ length: CYCLES }, () => L.STRIP.map(cell).join('')).join('');

    function cellHeight() {
      return reels[0].firstElementChild.getBoundingClientRect().height || 80;
    }

    // Translate so strip index `stop` (in copy `cycle`) sits on the middle row.
    function place(reel, stop, cycle, animate, duration) {
      const h = cellHeight();
      const y = -((cycle * L.STRIP.length + stop - 1) * h);
      reel.style.transition = animate ? `transform ${duration}s cubic-bezier(0.12, 0.6, 0.25, 1.04)` : 'none';
      reel.style.transform = `translateY(${y}px)`;
    }

    function resetReels() {
      reels.forEach((r, i) => place(r, stops[i], 1, false));
    }

    // Paytable
    $('#slots-paytable').innerHTML = [
      ['🍄🍄🍄', L.PAYTABLE.truffle, 'Jackpot!'],
      ['🐷🐷🐷', L.PAYTABLE.pig, ''],
      ['🥚🥚🥚', L.PAYTABLE.egg, ''],
      ['🍎🍎🍎', L.PAYTABLE.apple, ''],
      ['🌽🌽🌽', L.PAYTABLE.corn, ''],
      ['🥕🥕🥕', L.PAYTABLE.carrot, ''],
      ['🥕🥕 any', L.PAYTABLE.twoCarrots, ''],
    ].map(([icons, mult, note]) => `<div class="pt-row"><span class="pt-icons">${icons}</span><b>${mult}×</b>${note ? `<small>${note}</small>` : ''}</div>`).join('') +
      '<p class="pt-note">🐷 is wild — it counts as any symbol. Wins pay on the middle line. Payouts include your stake.</p>';

    function renderBet() {
      betEl.textContent = fmt(BETS[betIdx]);
      $('#slots-bet-down').disabled = spinning || betIdx === 0;
      $('#slots-bet-up').disabled = spinning || betIdx === BETS.length - 1;
      spinBtn.disabled = spinning;
      spinBtn.textContent = spinning ? 'Spinning…' : `SPIN (${fmt(BETS[betIdx])})`;
    }

    $('#slots-bet-down').addEventListener('click', () => {
      betIdx = Math.max(0, betIdx - 1);
      sound.chip();
      saveBet();
      renderBet();
    });
    $('#slots-bet-up').addEventListener('click', () => {
      betIdx = Math.min(BETS.length - 1, betIdx + 1);
      sound.chip();
      saveBet();
      renderBet();
    });
    function saveBet() {
      try {
        localStorage.setItem(BET_KEY, String(BETS[betIdx]));
      } catch (e) {
        // Ignore.
      }
    }

    spinBtn.addEventListener('click', spin);
    root.addEventListener('keydown', (e) => {
      if (!mounted || e.key !== ' ' || e.target.closest('input, dialog')) return;
      e.preventDefault();
      spin();
    });
    root.addEventListener('resize', () => mounted && !spinning && resetReels());

    function spin() {
      if (spinning) return;
      const bet = BETS[betIdx];
      if (!wallet.canAfford(bet)) {
        toast('Not enough Hay — lower your bet or get free Hay in your wallet.', 'warn');
        return;
      }
      spinning = true;
      machine.classList.remove('win', 'big-win');
      el.querySelectorAll('.reel-cell.hit').forEach((c) => c.classList.remove('hit'));
      winEl.textContent = '—';
      msgEl.textContent = 'Good luck!';
      wallet.spend(bet, `Piggy Bank Slots — spin`);

      const next = L.spin(root.FarmRng.mulberry32(root.FarmRng.randomSeed()));
      const result = L.evaluate(L.lineAt(next));
      const payout = result.multiplier * bet;
      // Lock in the payout before the reels finish, in case the page closes.
      if (payout > 0) root.FarmPending.save('slots', payout, `Piggy Bank Slots — ${describe(result)}`);

      resetReels();
      void reels[0].offsetHeight;
      const durations = [1.3, 1.75, 2.2];
      reels.forEach((r, i) => {
        r.parentElement.classList.add('spinning');
        place(r, next[i], 5 + i % 2, true, durations[i]);
        setTimeout(() => {
          r.parentElement.classList.remove('spinning');
          if (mounted) sound.click();
        }, durations[i] * 1000 - 120);
      });
      sound.chip();
      stops = next;
      setTimeout(() => finish(result, payout), durations[2] * 1000 + 50);
      renderBet();
    }

    function describe(result) {
      if (result.kind === 'three') return `three ${L.SYMBOLS[result.symbol].name.replace(' (wild)', '')}s`;
      if (result.kind === 'two') return 'two carrots';
      return 'no win';
    }

    function finish(result, payout) {
      spinning = false;
      resetReels();
      if (payout > 0) {
        wallet.credit(payout, `Piggy Bank Slots — ${describe(result)}`);
        root.FarmPending.clear('slots');
        winEl.textContent = `🌾 ${fmt(payout)}`;
        highlight(result);
        const big = result.multiplier >= 16;
        machine.classList.add(big ? 'big-win' : 'win');
        msgEl.textContent = result.symbol === 'truffle' ? 'JACKPOT! Golden truffles!' : big ? 'Big win!' : `${describe(result)}!`;
        if (big) {
          sound.fanfare();
          coinShower();
        } else {
          sound.coins();
        }
      } else {
        msgEl.textContent = ['Oink… not this time.', 'So close!', 'Have another go!'][Math.floor(Math.random() * 3)];
      }
      renderBet();
    }

    // Reels rest on strip copy 1 between spins, so that's where the line is.
    function highlight(result) {
      reels.forEach((r, i) => {
        const c = r.children[L.STRIP.length + stops[i]];
        if (c && (result.kind === 'three' || c.dataset.sym === 'carrot')) c.classList.add('hit');
      });
    }

    function coinShower() {
      const layer = $('#slots-coins');
      for (let i = 0; i < 40; i++) {
        const c = document.createElement('span');
        c.className = 'coin-drop';
        c.textContent = ['🪙', '🌾', '💰'][i % 3];
        c.style.left = `${Math.random() * 100}%`;
        c.style.animationDelay = `${Math.random() * 0.8}s`;
        c.style.fontSize = `${18 + Math.random() * 18}px`;
        layer.appendChild(c);
        setTimeout(() => c.remove(), 2600);
      }
    }

    return {
      mount() {
        mounted = true;
        const back = root.FarmPending.recover('slots', wallet);
        if (back) toast(`Your last spin paid 🌾${fmt(back)} — credited.`, 'good');
        renderBet();
        requestAnimationFrame(resetReels);
      },
      unmount() {
        mounted = false;
      },
    };
  }

  root.SlotsGame = { createSlots };
})(typeof globalThis !== 'undefined' ? globalThis : this);
