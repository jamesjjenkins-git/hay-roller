// Pending payouts for the credit games. A game decides the result and saves
// the payout here *before* animating it, then clears it once credited. If the
// page closes mid-animation, the payout is credited on the next load.
(function (root) {
  const PREFIX = 'farmCasino.pending.';

  function storage() {
    try {
      return root.localStorage;
    } catch (e) {
      return null;
    }
  }

  const api = {
    save(game, payout, note) {
      const s = storage();
      if (!s || payout <= 0) return;
      try {
        s.setItem(PREFIX + game, JSON.stringify({ payout, note }));
      } catch (e) {
        // Storage full: the payout still happens after the animation.
      }
    },
    clear(game) {
      const s = storage();
      if (s) s.removeItem(PREFIX + game);
    },
    // Pays out anything left over from a closed page. Returns total credited.
    recover(game, wallet) {
      const s = storage();
      if (!s) return 0;
      try {
        const p = JSON.parse(s.getItem(PREFIX + game));
        s.removeItem(PREFIX + game);
        if (p && Number.isInteger(p.payout) && p.payout > 0) {
          wallet.credit(p.payout, p.note);
          return p.payout;
        }
      } catch (e) {
        s.removeItem(PREFIX + game);
      }
      return 0;
    },
  };

  root.FarmPending = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
