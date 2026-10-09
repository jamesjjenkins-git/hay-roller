// AdMob settings for the iPhone app (the web build keeps the placeholder ads).
//
// Until `live` is true every request asks Google for a test ad, so nothing
// is earned and nothing can be flagged as invalid traffic. To go live:
//   1. Create the app and two ad units (Banner, Rewarded) in AdMob.
//   2. Put the ad unit ids below and the app id in ios/App/App/Info.plist
//      (GADApplicationIdentifier), then set `live: true`.
//   3. Never tap your own live ads: add your phone's id to `testDevices`
//      (Xcode's console prints it the first time an ad is requested).
// The ids already here are Google's public test ids.
(function (root) {
  const config = {
    live: false,
    ios: {
      banner: 'ca-app-pub-3940256099942544/2435281174',
      rewarded: 'ca-app-pub-3940256099942544/1712485313',
    },
    testDevices: [],
    // A cartoon farm game: keep ads suitable for a family audience.
    maxAdContentRating: 'ParentalGuidance',
  };

  root.FarmAdConfig = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
