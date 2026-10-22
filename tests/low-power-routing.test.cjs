'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectRoute,heartbeatIntervalMs}=require('../src/lib/low-power-routing.cjs');
const routes=[
{id:'relay',local:false,available:true,authenticated:true,estimatedMilliwatts:350,latencyMs:80},
{id:'local',local:true,available:true,authenticated:true,estimatedMilliwatts:40,latencyMs:4},
{id:'untrusted',local:true,available:true,authenticated:false,estimatedMilliwatts:5,latencyMs:2}
];
test('defaults to authenticated local route',()=>{const r=selectRoute({routes});assert.equal(r.selected.id,'local');assert.ok(r.rejected.some(x=>x.id==='relay'&&x.reason==='external-route-disabled'));assert.ok(r.rejected.some(x=>x.id==='untrusted'&&x.reason==='authentication-required'));});
test('enforces power budget',()=>{const r=selectRoute({routes,policy:{allowExternal:true,maxEstimatedMilliwatts:100}});assert.equal(r.selected.id,'local');assert.ok(r.rejected.some(x=>x.id==='relay'&&x.reason==='power-budget-exceeded'));});
test('fails closed if all routes are untrusted',()=>{const r=selectRoute({routes:[routes[2]]});assert.equal(r.status,'no-eligible-route');assert.equal(r.selected,null);});
test('quiet heartbeat reduces idle chatter and keeps busy interval short',()=>{assert.equal(heartbeatIntervalMs({quiet:true,nodeState:'idle'}),300000);assert.equal(heartbeatIntervalMs({quiet:true,nodeState:'busy'}),5000);assert.equal(heartbeatIntervalMs({quiet:false,nodeState:'idle'}),30000);});
test('rejects invalid heartbeat bounds',()=>assert.throws(()=>heartbeatIntervalMs({minMs:100,maxMs:10}),/bounds are invalid/));
test('rejects invalid power-policy values instead of silently disabling the budget', () => {
  assert.throws(() => selectRoute({ routes, policy: { maxEstimatedMilliwatts: Number.NaN } }), /finite and non-negative/);
  assert.throws(() => selectRoute({ routes, policy: { maxEstimatedMilliwatts: undefined } }), /finite and non-negative/);
  assert.throws(() => selectRoute({ routes, policy: { powerWeight: -1 } }), /finite and non-negative/);
});
