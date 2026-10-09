#!/usr/bin/env node
// Builds the iPhone app and uploads it to App Store Connect for TestFlight.
//
//   npm run testflight
//
// Needs the paid Apple Developer Program: the team set in Xcode (App target →
// Signing & Capabilities) must be your developer team, not a free Personal
// Team, and the app must exist in App Store Connect with this bundle id.
// Xcode must be signed in to that account (Settings → Accounts); signing
// certificates and profiles are created automatically.
//
// The build number is the number of commits, so every upload is higher than
// the last; the version shown in TestFlight is MARKETING_VERSION (1.0).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IOS = path.join(ROOT, 'ios', 'App');
const OUT = path.join(IOS, 'build');
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const read = (cmd) => execSync(cmd, { cwd: ROOT }).toString().trim();

const pbx = fs.readFileSync(path.join(IOS, 'App.xcodeproj', 'project.pbxproj'), 'utf8');
const team = process.env.TEAM || (pbx.match(/DEVELOPMENT_TEAM = (\w+);/) || [])[1];
if (!team) {
  console.error('No development team set. In Xcode: App target → Signing & Capabilities → Team.');
  process.exit(1);
}

// A free Personal Team can't upload to App Store Connect. Xcode's saved
// team list can lag behind joining the paid program (an individual
// membership keeps the same team id), so this only warns; Apple decides.
try {
  const teams = read('defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier');
  const block = teams.split(/\n\s*\}/).find((b) => b.includes(`teamID = ${team};`)) || '';
  if (/isFreeProvisioningTeam = 1;/.test(block)) {
    console.warn(`Note: Xcode last saw team ${team} as a free Personal Team. TestFlight needs the paid`);
    console.warn('Apple Developer Program; if the upload fails with a team or certificate error,');
    console.warn('check developer.apple.com/account and Xcode → Settings → Accounts.');
  }
} catch (e) {
  // Couldn't read Xcode's team list; let xcodebuild decide.
}

const build = read('git rev-list --count HEAD');
console.log(`Building for TestFlight: team ${team}, build ${build}`);

run('node scripts/build-web.js');
run('npx cap sync ios');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const archive = path.join(OUT, 'FarmyardRally.xcarchive');
run(
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release ` +
    `-destination generic/platform=iOS -archivePath "${archive}" ` +
    `-allowProvisioningUpdates DEVELOPMENT_TEAM=${team} CURRENT_PROJECT_VERSION=${build} archive`,
);

// Upload straight to App Store Connect (it appears in TestFlight once Apple
// has processed it, usually 5–30 minutes).
const options = path.join(OUT, 'ExportOptions.plist');
fs.writeFileSync(options, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>teamID</key>
  <string>${team}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
`);
run(`xcodebuild -exportArchive -archivePath "${archive}" -exportOptionsPlist "${options}" -exportPath "${OUT}" -allowProvisioningUpdates`);
console.log(`\nUploaded build ${build}. It shows in App Store Connect → TestFlight once Apple has processed it.`);
