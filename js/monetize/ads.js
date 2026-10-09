// Ads: one home-page banner and opt-in rewarded videos, behind a provider
// adapter. The built-in provider shows clearly labelled placeholders; swap in
// a real network (e.g. AdMob via Capacitor) by calling FarmAds.setProvider().
//
// Provider interface:
//   showBanner(el)       render a banner into `el`
//   hideBanner(el)       remove it
//   showRewarded()       Promise<boolean> — true only if the ad was watched to the end
(function (root) {
  const PLACEHOLDER_SECONDS = 5;

  const placeholderProvider = {
    name: 'placeholder',
    showBanner(el) {
      const promos = [
        ['🥚', 'Egg Roulette', 'Which nest will she pick?', '#/egg-roulette'],
        ['🐷', 'Piggy Bank Slots', 'Three truffles pays 300×!', '#/slots'],
        ['🌾', 'Hay Bale Derby', 'Back a bale, beat the cows.', '#/hay-derby'],
      ];
      const [icon, title, line, href] = promos[Math.floor(Math.random() * promos.length)];
      el.innerHTML = `
        <span class="ad-label">Ad</span>
        <a class="ad-house" href="${href}">
          <span class="ad-icon">${icon}</span>
          <span><b>${title}</b><small>${line}</small></span>
          <span class="ad-cta">Play</span>
        </a>`;
    },
    hideBanner(el) {
      el.innerHTML = '';
    },
    showRewarded() {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'ad-overlay';
        overlay.innerHTML = `
          <div class="ad-video" role="dialog" aria-label="Advertisement">
            <span class="ad-label">Ad</span>
            <div class="ad-screen">
              <div class="ad-tractor">🚜💨</div>
              <p><b>Ad placeholder</b><br>A real video ad will play here once an ad network is connected.</p>
            </div>
            <div class="ad-bar"><div class="ad-progress"></div></div>
            <div class="ad-actions">
              <button class="btn btn-ghost btn-small" data-ad="close">Close (no reward)</button>
              <button class="btn btn-primary" data-ad="collect" disabled>Reward in ${PLACEHOLDER_SECONDS}s</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const collect = overlay.querySelector('[data-ad="collect"]');
        const bar = overlay.querySelector('.ad-progress');
        const start = performance.now();
        let done = false;
        const timer = setInterval(() => {
          const t = (performance.now() - start) / 1000;
          bar.style.width = `${Math.min(100, (t / PLACEHOLDER_SECONDS) * 100)}%`;
          const left = Math.ceil(PLACEHOLDER_SECONDS - t);
          if (left > 0) {
            collect.textContent = `Reward in ${left}s`;
          } else if (!done) {
            done = true;
            collect.disabled = false;
            collect.textContent = 'Collect reward';
          }
        }, 100);
        const finish = (watched) => {
          clearInterval(timer);
          overlay.remove();
          resolve(watched);
        };
        overlay.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ad]');
          if (!b) return;
          finish(b.dataset.ad === 'collect' && done);
        });
      });
    },
  };

  let provider = placeholderProvider;
  let busy = false;

  root.FarmAds = {
    get provider() {
      return provider.name;
    },
    setProvider(p) {
      provider = p;
    },
    showBanner(el) {
      provider.showBanner(el);
    },
    hideBanner(el) {
      provider.hideBanner(el);
    },
    // Resolves true only if the player watched to the end.
    async showRewarded() {
      if (busy) return false;
      busy = true;
      try {
        return await provider.showRewarded();
      } catch (e) {
        return false;
      } finally {
        busy = false;
      }
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
