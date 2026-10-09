// Update checker for the published web app.
//
// The deploy step stamps the build id into <meta name="app-version"> and
// writes version.json. When a newer build is live, we show a banner; tapping
// it reloads through a fresh URL so the phone can't reuse cached files.
(function (root) {
  const meta = document.querySelector('meta[name="app-version"]');
  const current = meta ? meta.content : 'dev';
  const isDev = !current || current.startsWith('__');
  let latest = null;
  let banner = null;

  async function fetchLatest() {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.version;
  }

  function applyUpdate() {
    const url = new URL(location.href);
    url.searchParams.set('v', latest || Date.now());
    location.replace(url.toString());
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement('button');
    banner.className = 'update-banner';
    banner.innerHTML = '🚜 <b>New version available</b> — tap to update';
    banner.addEventListener('click', applyUpdate);
    document.body.appendChild(banner);
  }

  // Returns 'updated' | 'current' | 'dev' | 'offline'.
  async function check() {
    if (isDev) return 'dev';
    try {
      latest = await fetchLatest();
    } catch (e) {
      return 'offline';
    }
    if (latest && latest !== current) {
      showBanner();
      return 'updated';
    }
    return 'current';
  }

  root.FarmUpdate = { current: isDev ? 'dev' : current, check, applyUpdate };

  check();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  setInterval(check, 5 * 60 * 1000);
})(typeof globalThis !== 'undefined' ? globalThis : this);
