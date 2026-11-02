import {describe,it,expect} from 'vitest';
import {SessionIntegrity} from '../sessionIntegrity';
describe('presentation session checkpoints',()=>{
 it('distinguishes no session, new unsaved session and saved load',()=>{const s=new SessionIntegrity();expect(s.exists).toBe(false);expect(s.dirty).toBe(false);s.begin(false);expect(s.dirty).toBe(true);s.begin(true,'a');expect(s.exists).toBe(true);expect(s.dirty).toBe(false);s.changed();expect(s.dirty).toBe(true);});
 it('only acknowledges the revision actually persisted',()=>{const s=new SessionIntegrity();s.begin(true,'a');s.changed();const saved=s.checkpoint();s.changed();s.acknowledge(saved,'b');expect(s.dirty).toBe(true);s.acknowledge(s.checkpoint(),'b');expect(s.dirty).toBe(false);});
 it('does not let a pending save clear a replacement session',()=>{const s=new SessionIntegrity();s.begin(false);const old=s.checkpoint();s.begin(false);s.acknowledge(old,'autosave');expect(s.dirty).toBe(true);});
 it('invalidates a checkpoint deleted or overwritten by an older session',()=>{const s=new SessionIntegrity();s.begin(true,'a');const old=s.checkpoint();s.begin(true,'b');s.acknowledge(old,'b');expect(s.dirty).toBe(true);s.begin(true,'c');s.removedSave('a');expect(s.dirty).toBe(false);s.removedSave('c');expect(s.dirty).toBe(true);});
 it('ignores out-of-order acknowledgements to another slot but tracks overwrite of the current slot',()=>{const s=new SessionIntegrity();s.begin(false);const first=s.checkpoint();s.changed();s.acknowledge(s.checkpoint(),'latest');s.acknowledge(first,'other');expect(s.dirty).toBe(false);s.acknowledge(first,'latest');expect(s.dirty).toBe(true);});
});
