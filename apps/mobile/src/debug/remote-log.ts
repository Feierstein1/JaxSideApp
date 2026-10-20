import { Platform } from 'react-native';
import { API_BASE_URL } from '@/api';

/**
 * D100 (temporary): sends the app's errors to the development server's log file so they
 * can be read on the computer (`apps/server/logs/client.log`). Only in development builds
 * (`__DEV__`); fire-and-forget, and it never throws or loops on its own failures.
 */
let sending = 0;

export function remoteLog(
  level: 'error' | 'warn' | 'info',
  message: string,
  where?: string,
  details?: unknown,
) {
  if (!__DEV__ || sending > 20) return;
  sending++;
  const body = JSON.stringify({
    level,
    message: String(message).slice(0, 4000),
    ...(where ? { where: where.slice(0, 200) } : {}),
    ...(details !== undefined
      ? {
          details: (typeof details === 'string' ? details : safeJson(details)).slice(0, 8000),
        }
      : {}),
    platform: `${Platform.OS} ${Platform.Version}`,
  });
  fetch(`${API_BASE_URL}/api/v1/dev/client-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
    .catch(() => undefined)
    .finally(() => {
      sending--;
    });
}

function safeJson(v: unknown): string {
  try {
    return v instanceof Error ? `${v.name}: ${v.message}\n${v.stack ?? ''}` : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

let installed = false;

/** Catches crashes and console errors app-wide (development only). */
export function installRemoteLogging() {
  if (!__DEV__ || installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
  };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    remoteLog('error', e instanceof Error ? e.message : String(e), fatal ? 'crash' : 'uncaught', e);
    previous?.(e, fatal);
  });
  const original = console.error;
  console.error = (...args: unknown[]) => {
    remoteLog(
      'error',
      args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '),
      'console.error',
    );
    original(...args);
  };
}
