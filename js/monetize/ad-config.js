// AdMob settings for the iPhone app (the web build keeps the placeholder ads).
//
// Until `live` is true every request asks Google for a test ad, so nothing
// is earned and nothing can be flagged as invalid traffic. To go live:
//   1. Create the app and two ad units (Banner, Rewarded) in AdMob.
//   2. Put the ad unit ids below and the app id in ios/App/App/Info.plist
//      (GADApplicationIdentifier), then set `live: true`.
//   3. Never tap your own live ads: add your phone's id to `testDevices`
//      (Xcode's console prints it the first time an ad is requested).
// The simulator always gets test ads; a real phone gets real ones unless
// it's listed in `testDevices`.
(function (root) {
  const config = {
    live: true,
    // Farmyard Rally in AdMob: app ca-app-pub-3653000407024097~5736706042.
    ios: {
      banner: 'ca-app-pub-3653000407024097/9028163924', // Home banner
      rewarded: 'ca-app-pub-3653000407024097/7017998123', // Free Hay
    },
    // James's iPhone: always test ads, so tapping them can't flag the account.
    testDevices: ['faa6cd82b13b319dff934a605c2fb47d'],
    // A cartoon farm game: keep ads suitable for a family audience.
    maxAdContentRating: 'ParentalGuidance',
  };

  root.FarmAdConfig = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
