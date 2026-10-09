// Reaches a native Capacitor plugin from the game's plain scripts. The app
// doesn't bundle @capacitor/core (whose registerPlugin() does this), so this
// builds the same thing from what the native bridge provides: every method
// call goes through Capacitor.nativePromise, events through
// Capacitor.addListener. Returns null in a browser or if the plugin isn't
// in the app.
(function (root) {
  function nativePlugin(name) {
    const cap = root.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || !cap.nativePromise) return null;
    const header = (cap.PluginHeaders || []).find((h) => h.name === name);
    if (!header) return null;
    const plugin = {
      addListener(eventName, fn) {
        return Promise.resolve(cap.addListener(name, eventName, fn));
      },
    };
    for (const m of header.methods || []) {
      if (m.name === 'addListener' || m.name === 'removeListener') continue;
      plugin[m.name] = (options) => cap.nativePromise(name, m.name, options || {});
    }
    return plugin;
  }

  root.FarmNative = { nativePlugin };
})(typeof globalThis !== 'undefined' ? globalThis : this);
