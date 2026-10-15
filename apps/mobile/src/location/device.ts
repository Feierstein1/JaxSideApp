import * as Location from 'expo-location';
import type { LocationReading } from '@jax/shared';
import { toReading } from './reading';

/**
 * A fresh GPS reading for a location-restricted request. Never cached: the server
 * rejects readings older than 60 seconds. Permission must already be granted; no
 * prompt is shown here.
 */
export async function getFreshReading(): Promise<LocationReading> {
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return toReading(loc);
}
