import { describe, expect, it } from 'vitest';
import { readSettings, renderProfile } from './hallSettings';

describe('device defaults and stored graphics settings', () => {
  it('starts phones at low cost while retaining desktop quality', () => {
    expect(readSettings(null, true)).toMatchObject({
      quality: 'LOW',
      shadows: false,
      ambientGuests: 4,
      headBob: false,
    });
    expect(readSettings(null, false).quality).toBe('MEDIUM');
  });
  it('honours an explicit saved quality on a phone', () => {
    expect(
      readSettings({ quality: 'HIGH', shadows: true }, true),
    ).toMatchObject({ quality: 'HIGH', shadows: true, ambientGuests: 18 });
  });
  it('recovers from corrupted settings instead of crashing the renderer', () => {
    const settings = readSettings(
      { quality: 'ULTRA', shadows: 'yes', volume: 'loud', ambientGuests: NaN },
      true,
    );
    expect(settings).toMatchObject({
      quality: 'LOW',
      shadows: false,
      volume: 0.6,
      ambientGuests: 4,
    });
    expect(renderProfile(settings.quality).antialias).toBe(false);
  });
  it('clamps finite values and respects reduced motion', () => {
    expect(
      readSettings({ volume: 90, ambientGuests: -3 }, false, true),
    ).toMatchObject({ volume: 1, ambientGuests: 0, reducedMotion: true });
  });
});
