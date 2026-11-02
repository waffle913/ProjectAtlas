/** Presentation-only revision bookkeeping. Never serialized into SimulationState. */
export interface SessionCheckpoint { session: number; revision: number }
export class SessionIntegrity {
  private session = 0;
  private revision = 0;
  private savedRevision = -1;
  private savedSlot?:string;
  exists = false;
  begin(saved: boolean, slot?:string) { this.session++; this.revision=0; this.savedRevision=saved?0:-1; this.savedSlot=saved?slot:undefined; this.exists=true; }
  changed() { if(this.exists)this.revision++; }
  get dirty() { return this.exists && this.revision>this.savedRevision; }
  checkpoint(): SessionCheckpoint { return {session:this.session,revision:this.revision}; }
  acknowledge(checkpoint: SessionCheckpoint,slot?:string) {
    if(!this.exists)return;
    if(checkpoint.session!==this.session){if(slot && slot===this.savedSlot)this.savedRevision=-1;return;}
    const revision=Math.min(checkpoint.revision,this.revision);
    if(slot===this.savedSlot || revision>=this.savedRevision){this.savedRevision=revision;this.savedSlot=slot;}
  }
  removedSave(slot:string){if(slot===this.savedSlot)this.savedRevision=-1;}
}
