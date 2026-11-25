import {eq} from "drizzle-orm";
import {db} from "../db/client.js";
import {sessions,simEvents} from "../db/schema.js";
import {getBranch,seenAs} from "./world.js";

/** What an earlier engine called the call that ran a thing put to a body through its people. */
const BODY_RUN="body_run";
type TraceLike={complete:boolean;calls:{actor:{id:string;name:string}|null;purpose:string;events:string[];detail:Record<string,unknown>}[];events:{id:string;actorId:string|null;title:string}[];totals:{actors:number}};
/** What is said of one call joins its events' words with a full-width semicolon ("\uff1b"): a mark the pages read as it is. */
const LIST="\uff1b";
/** The product's playback receives committed observations, never raw private model output. */
export function publicStepTrace<T extends TraceLike>(branchId:string,trace:T):T {
 const b=getBranch(branchId),session=db().select().from(sessions).where(eq(sessions.id,b.sessionId)).get();
 if(!session)throw new Error("No such play");
 const seat=session.seatEntityId,undo=b.pendingAction as {tag?:string}|null;
 const committed=undo?.tag!=="step-undo-v1";
 const observations=new Map((committed?db().select().from(simEvents).where(eq(simEvents.branchId,branchId)).all():[])
  .filter(e=>e.simTime<=b.simTime&&(e.visibility==="public"||e.audience.includes(seat)||e.actorId===seat)).map(e=>[e.id,{...e,...seenAs(e,seat)}]));
 const events=trace.events.filter(e=>observations.has(e.id)).map(e=>({...e,title:observations.get(e.id)!.title}));
 const calls=trace.calls.map(c=>{
  const observed=c.events.map(id=>observations.get(id)).filter(e=>!!e);
  const actor=c.actor&&observed.some(e=>e.actorId===c.actor!.id)?c.actor:null;
  let detail:Record<string,unknown>={};
  if(c.purpose==="person")detail={action:observed.map(e=>e.description).join(LIST)||null,open:observed.some(e=>e.visibility==="public")};
  else if(c.purpose==="rule")detail={restatement:observed.filter(e=>e.actorId===seat).map(e=>e.description).join(LIST)};
  else if(c.purpose==="moment"&&committed)detail={headline:c.detail.headline,options:c.detail.options,summary:observed.map(e=>e.description).join(LIST)};
  // how a body argued a thing inside is kept for the review: nothing of its run is shown, only what reached the protagonist as an event
  else if(c.purpose===BODY_RUN)detail={};
  return {...c,actor,events:observed.map(e=>e.id),detail};
 });
 return {...trace,complete:trace.complete&&committed,calls,events,totals:{...trace.totals,actors:new Set(calls.flatMap(c=>c.actor?[c.actor.id]:[])).size}} as T;
}
