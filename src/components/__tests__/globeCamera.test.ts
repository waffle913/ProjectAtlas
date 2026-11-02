import {describe,it,expect} from 'vitest';
import {countryFocus,focusDistance,easeCamera} from '../new-game/globeCamera';
import type {GlobePolygon} from '../new-game/globeGeometry';
describe('presentation camera framing',()=>{
 it('adapts distance to country size and narrow viewport within safe bounds',()=>{expect(focusDistance(.02,40,1.7)).toBeLessThan(focusDistance(.3,40,1.7));expect(focusDistance(.2,40,.7)).toBeGreaterThan(focusDistance(.2,40,1.7));expect(focusDistance(0,40,2)).toBeGreaterThan(1);expect(focusDistance(1,40,.2)).toBeLessThanOrEqual(5);});
 it('uses the main component without fitting distant overseas components and handles missing geography',()=>{const p=[{countryId:'c',area:25,rings:[[[0,0],[5,0],[5,5],[0,5],[0,0]]]},{countryId:'c',area:1,rings:[[[150,0],[151,0],[151,1],[150,1],[150,0]]]}] as GlobePolygon[];expect(countryFocus(p,'c')!.radius).toBeLessThan(.2);expect(countryFocus(p,'missing')).toBeUndefined();});
 it('clamps easing and ends exactly at target',()=>{expect(easeCamera(-1)).toBe(0);expect(easeCamera(1)).toBe(1);expect(easeCamera(2)).toBe(1);expect(easeCamera(.5)).toBeGreaterThan(.5);});
});
