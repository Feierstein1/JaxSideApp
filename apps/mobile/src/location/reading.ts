import type { LocationReading } from '@jax/shared';

/** The parts of an expo-location result we use (kept minimal so this stays unit-testable). */
export interface DeviceLocation {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
  mocked?: boolean;
}

/**
 * Converts a device reading into the server's reading format (§6.2).
 * A missing accuracy is sent as very poor accuracy, so the server rejects it
 * instead of the app guessing.
 */
export function toReading(loc: DeviceLocation): LocationReading {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracyMeters: loc.coords.accuracy && loc.coords.accuracy > 0 ? loc.coords.accuracy : 100_000,
    timestamp: Math.round(loc.timestamp),
    ...(loc.mocked ? { mocked: true } : {}),
  };
}
