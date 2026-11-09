import { describe, expect, it } from 'vitest';
import { censusGeocodeUrl, parseCensusGeocode, placeRequestSchema } from './place-requests';

// D224: "Add my business" / "Ask JaxSide to verify me" from the owner website.

const base = { placeName: 'Bold Bean', contactName: 'Ann' };

describe('placeRequestSchema', () => {
  it('an existing place needs only its id', () => {
    expect(
      placeRequestSchema.safeParse({ ...base, placeId: '00000000-0000-7000-8000-000000000000' })
        .success,
    ).toBe(true);
  });

  it('a new place needs its address, kind and pin (both coordinates)', () => {
    const full = {
      ...base,
      placeAddress: '1 Main St, Jacksonville, FL',
      category: 'cafe',
      latitude: 30.33,
      longitude: -81.66,
    };
    expect(placeRequestSchema.safeParse(full).success).toBe(true);
    expect(placeRequestSchema.safeParse({ ...full, longitude: undefined }).success).toBe(false);
    expect(placeRequestSchema.safeParse({ ...base, placeAddress: '1 Main St' }).success).toBe(
      false,
    );
  });
});

describe('Census geocoding', () => {
  const answer = {
    result: {
      addressMatches: [
        {
          matchedAddress: '1 W BAY ST, JACKSONVILLE, FL, 32202',
          coordinates: { x: -81.66, y: 30.32 },
        },
      ],
    },
  };

  it('builds the request and reads the first match', () => {
    expect(censusGeocodeUrl('1 W Bay St, Jacksonville FL')).toContain(
      'onelineaddress?address=1%20W%20Bay%20St',
    );
    expect(parseCensusGeocode(answer)).toEqual({
      latitude: 30.32,
      longitude: -81.66,
      matchedAddress: '1 W BAY ST, JACKSONVILLE, FL, 32202',
    });
    expect(parseCensusGeocode({ result: { addressMatches: [] } })).toBeNull();
  });
});
