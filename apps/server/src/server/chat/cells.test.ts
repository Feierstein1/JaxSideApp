import { describe, expect, it } from 'vitest';
import {
  CELL_LAT_DEG,
  CELL_LNG_DEG,
  SWITCH_MARGIN_METERS,
  cellBounds,
  cellCenter,
  cellKeyOf,
  chooseCell,
  compassFrom,
  metersOutside,
} from './cells';
import { metersBetween } from '../location/neighborhood';

const riverside = { latitude: 30.3166, longitude: -81.6937 };
const key = cellKeyOf(riverside);

describe('chat cells (D218)', () => {
  it('a cell is about a mile across in Jacksonville', () => {
    const b = cellBounds(key);
    const ns = metersBetween({ lat: b.south, lon: b.west }, { lat: b.north, lon: b.west });
    const ew = metersBetween({ lat: b.south, lon: b.west }, { lat: b.south, lon: b.east });
    expect(ns).toBeGreaterThan(1500);
    expect(ns).toBeLessThan(1700);
    expect(ew).toBeGreaterThan(1500);
    expect(ew).toBeLessThan(1700);
  });

  it('the same point always gives the same cell, and its centre is inside it', () => {
    expect(cellKeyOf(riverside)).toBe(key);
    expect(cellKeyOf(cellCenter(key))).toBe(key);
  });

  it('points a few metres apart on opposite sides of a border get different cells', () => {
    const b = cellBounds(key);
    const a = { latitude: riverside.latitude, longitude: b.east - 0.00001 };
    const c = { latitude: riverside.latitude, longitude: b.east + 0.00001 };
    expect(cellKeyOf(a)).toBe(key);
    expect(cellKeyOf(c)).not.toBe(key);
  });

  it('metersOutside is 0 inside and grows with distance', () => {
    const b = cellBounds(key);
    expect(metersOutside(key, cellCenter(key))).toBe(0);
    const north100 = { latitude: b.north + 100 / 111_320, longitude: cellCenter(key).longitude };
    expect(metersOutside(key, north100)).toBeCloseTo(100, 0);
  });

  it('stays in the old room until clearly inside the new one (no flip-flopping on a border)', () => {
    const b = cellBounds(key);
    const lat = riverside.latitude;
    const justOver = {
      latitude: lat,
      longitude: b.east + 50 / (111_320 * Math.cos((lat * Math.PI) / 180)),
    };
    const farOver = {
      latitude: lat,
      longitude: b.east + 400 / (111_320 * Math.cos((lat * Math.PI) / 180)),
    };
    expect(chooseCell(key, justOver)).toBe(key);
    expect(chooseCell(key, farOver)).toBe(cellKeyOf(farOver));
    expect(chooseCell(null, justOver)).toBe(cellKeyOf(justOver));
    expect(SWITCH_MARGIN_METERS).toBe(150);
  });

  it('cell sizes never change (they would move every room)', () => {
    expect(CELL_LAT_DEG).toBe(0.01446);
    expect(CELL_LNG_DEG).toBe(0.01675);
  });

  it('names the direction from a centre', () => {
    const o = { latitude: 30.3, longitude: -81.7 };
    expect(compassFrom(o, { latitude: 30.31, longitude: -81.7 })).toBe('N');
    expect(compassFrom(o, { latitude: 30.29, longitude: -81.7 })).toBe('S');
    expect(compassFrom(o, { latitude: 30.3, longitude: -81.69 })).toBe('E');
    expect(compassFrom(o, { latitude: 30.31, longitude: -81.69 })).toBe('NE');
    expect(compassFrom(o, { latitude: 30.29, longitude: -81.71 })).toBe('SW');
  });
});
