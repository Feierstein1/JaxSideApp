#!/usr/bin/env node
/**
 * Test the app on your phone away from home Wi-Fi (D68).
 *
 *   1. Start the server as usual:   npm run dev
 *   2. In another terminal:         npm run dev:remote
 *   3. Scan the QR code with Expo Go (Android) or the Camera app (iPhone).
 *
 * What it does:
 * - Opens a Cloudflare quick tunnel to the local API (a random https://….trycloudflare.com
 *   address, free, no account). The address changes every run.
 * - Starts Expo in tunnel mode so the app's code also loads over the internet, with the app
 *   pointed at the tunnel address.
 *
 * Your computer must stay on with both commands running. While it runs, the API is
 * reachable by anyone who knows the random address, so stop it (Ctrl+C) when you're done.
 * The admin portal never answers through the tunnel (only on this computer).
 */
import { spawn } from 'node:child_process';
import { bin } from 'cloudflared';

const LOCAL = 'http://localhost:3000';

async function localServerUp() {
  try {
    const r = await fetch(`${LOCAL}/api/v1/health`);
    return r.ok;
  } catch {
    return false;
  }
}

// D91: the Wi-Fi-only app (dev:mobile, port 8081) running at the same time is the usual
// reason the phone "can't connect" away from home: Expo Go reopens that version.
async function wifiOnlyExpoUp() {
  try {
    await fetch('http://localhost:8081/status', { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

if (!(await localServerUp())) {
  console.error(
    'The server isn’t running. Start it first with `npm run dev`, then run this again.',
  );
  process.exit(1);
}

// Windows: keep the computer from sleeping while this runs (the screen may still turn off).
// Ends automatically when this script stops; no power settings are changed.
let awake = null;
if (process.platform === 'win32') {
  const ps = `
$sig = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';
$k = Add-Type -MemberDefinition $sig -Name Power -Namespace Jax -PassThru;
while ($true) { [void]$k::SetThreadExecutionState(0x80000001); Start-Sleep -Seconds 30 }`;
  awake = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: 'ignore',
    windowsHide: true,
  });
  console.log('Keeping this computer awake while the tunnel runs (screen can still turn off).');
}

console.log('Opening a tunnel to the API…');
const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', LOCAL], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('No tunnel address after 45 s')), 45_000);
  const onData = (chunk) => {
    const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      clearTimeout(timer);
      resolve(m[0]);
    }
  };
  tunnel.stdout.on('data', onData);
  tunnel.stderr.on('data', onData);
  tunnel.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
}).catch((err) => {
  console.error(`Couldn’t open the tunnel: ${err.message}`);
  tunnel.kill();
  process.exit(1);
});

// New tunnel names take a few seconds to reach DNS; asking too early makes Windows cache a
// "not found" answer for a while. Wait first, then check.
console.log(`Tunnel address: ${url} (checking it in 15 s…)`);
await new Promise((r) => setTimeout(r, 15_000));
let ok = false;
for (let i = 0; i < 20 && !ok; i++) {
  try {
    ok = (await fetch(`${url}/api/v1/health`)).ok;
  } catch {
    // not yet
  }
  if (!ok) await new Promise((r) => setTimeout(r, 1500));
}
console.log(
  ok
    ? `API reachable at ${url}`
    : `Tunnel open at ${url} (not answering yet; it may take a moment)`,
);

if (await wifiOnlyExpoUp()) {
  console.warn(
    '\n  ⚠  `npm run dev:mobile` (Wi-Fi only) is also running. Stop it (Ctrl+C in its window).\n' +
      '     On your phone, don’t reopen the old project from Expo Go’s recent list: it only\n' +
      '     works on home Wi-Fi. Use the address printed below instead.\n',
  );
}

console.log('Starting Expo in tunnel mode (the QR code works from anywhere)…\n');
const expo = spawn('npx', ['expo', 'start', '--tunnel', '--clear', '--port', '8082'], {
  cwd: new URL('../apps/mobile/', import.meta.url),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_API_URL: url },
});

// D91: once Expo's tunnel is up, print the exact address to open on the phone.
void (async () => {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch('http://localhost:8082', {
        headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
      });
      const host = (await res.json())?.extra?.expoClient?.hostUri;
      if (host && host.includes('exp.direct')) {
        console.log(
          `\n  ✅ Ready. On your phone (any network): open Expo Go → scan the QR code above,\n` +
            `     or tap "Enter URL manually" and type:  exp://${host}\n` +
            `     The app talks to the server at ${url}\n`,
        );
        return;
      }
    } catch {
      // not up yet
    }
  }
})();

const stop = () => {
  tunnel.kill();
  expo.kill();
  awake?.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
expo.on('exit', stop);
tunnel.on('exit', () => {
  console.error('\nThe API tunnel closed. Run `npm run dev:remote` again for a new address.');
  expo.kill();
  awake?.kill();
  process.exit(1);
});
