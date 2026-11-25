import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";
useTempDb();
const fact=(over:Record<string,unknown>)=>({id:"fact_1",worldId:"w",content:"Rent forecast",occurredAt:"2020-01-01",publishedAt:null,knownBy:[],circles:[],entityIds:[],sourceId:null,quote:null,contentHash:"",evidence:{status:"happened"},createdAt:"",...over}) as never;
test("a fact public from its day is seen by anyone from that day, whatever its source; before it, only who knew", async()=>{
 const {isVisible}=await import("../src/facts/query.ts");
 const f=fact({publishedAt:"2021-01-01",knownBy:["insider"]});
 assert.equal(isVisible(f,"2021-06-01","mother",new Set(),null),true);
 assert.equal(isVisible(f,"2020-06-01","mother",new Set(),null),false);
 assert.equal(isVisible(f,"2020-06-01","insider",new Set(),null),true);
});
test("a fact that went round a circle is seen by its members, and not by others", async()=>{
 const {isVisible}=await import("../src/facts/query.ts");
 const f=fact({circles:["c1"]});
 assert.equal(isVisible(f,"2021-01-01","a",new Set(),null,new Set(["c1"])),true);
 assert.equal(isVisible(f,"2021-01-01","b",new Set(),null,new Set(["c2"])),false);
});
test("future starts remain future, and invalid calendar dates cannot enter the simulation",async()=>{
 const {cleanSetup}=await import("../src/world/setup.ts");const {normDate}=await import("../src/util.ts");
 const slot={value:"The future",source:"said" as const,random:false};
 const s=cleanSetup({world:slot,premises:[],role:{...slot,kind:"made",name:null},start:{...slot,date:"2080-01-01"},goal:null},"2026-01-01");
 assert.equal(s.start.date,"2080-01-01");assert.match(s.start.note!,/projected/);
 assert.equal(normDate("2025-02-29"),null);assert.equal(normDate("2024-02-29"),"2024-02-29");assert.equal(normDate("800-3"),"0800-03-01");
});
test('search budget covers the end of a long user query instead of only its opening',async()=>{
 const {ftsTerms}=await import('../src/db/client.ts');const terms=ftsTerms(Array.from({length:80},(_,i)=>`topic${i}`).join(' '),10);
 assert.equal(terms.length,10);assert.ok(terms.includes('topic0'));assert.ok(terms.includes('topic79'));
});
