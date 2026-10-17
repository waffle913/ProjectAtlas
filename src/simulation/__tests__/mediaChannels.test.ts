import { describe, it, expect } from 'vitest';
import {
  validateMediaChannel, diffuse, CHANNEL_OWNERS, type MediaChannel,
} from '../media/channels';

const channel = (over: Partial<MediaChannel> = {}): MediaChannel => ({
  id: 'ch-1', kind: 'news', reachBps: 5000, schedule: 'weekly', sourceId: 'src-1', note: 'national news',
  ...over,
});
const item = (layer: 'reality' | 'government-information' | 'public-perception', sourceId = 'src-1') => ({ layer, sourceId });

describe('media and information channels (0.32.2)', () => {
  it('names canonical owners and validates a channel', () => {
    expect(CHANNEL_OWNERS.audience).toBe('politics');
    expect(CHANNEL_OWNERS.sources).toBe('information');
    expect(() => validateMediaChannel(channel())).not.toThrow();
    expect(() => validateMediaChannel(channel({ reachBps: 20000 }))).toThrow(/between 0 and 10000/);
    expect(() => validateMediaChannel(channel({ kind: 'rumour' as never }))).toThrow(/Unknown channel kind/);
  });

  it('diffuses only through an explicit layer-access grant and from its own source', () => {
    expect(diffuse(channel(), item('government-information'), 'public-perception', 'public_disclosure')).toEqual({ status: 'computed', reachBps: 5000 });
    expect(diffuse(channel(), item('reality'), 'public-perception', 'public_disclosure')).toEqual({ status: 'unavailable', reachBps: null }); // never direct
    expect(diffuse(channel(), item('government-information'), 'public-perception', 'none')).toEqual({ status: 'unavailable', reachBps: null });
    expect(diffuse(channel(), item('government-information', 'other-source'), 'public-perception', 'public_disclosure')).toEqual({ status: 'unavailable', reachBps: null }); // wrong source
    expect(diffuse(channel({ reachBps: null }), item('government-information'), 'public-perception', 'public_disclosure')).toEqual({ status: 'unavailable', reachBps: null });
  });
});
