import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaReplacement } from '../src/lib/mediaReplacement.ts';
const deferred = () => { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; };
const stream = () => {
  const tracks=['audio','video'].map(kind=>({kind,enabled:true,readyState:'live',stop(){this.readyState='ended';}}));
  return {getTracks:()=>tracks};
};

test('replacement stays disabled until commit and uses the latest mute choice',async()=>{
  const manager=createMediaReplacement(), candidate=stream(), hold=deferred();
  let muted=false,commits=0;
  const operation=manager.run({acquire:async()=>candidate,isCurrent:()=>true,
    senders:[{track:{kind:'audio'},replaceTrack:async track=>{assert.equal(track.enabled,false);await hold.promise;}}],
    commit:value=>{commits++;value.getTracks().forEach(t=>{t.enabled=!muted;});}});
  await new Promise(r=>setImmediate(r));
  assert.ok(candidate.getTracks().every(t=>!t.enabled));
  muted=true;hold.resolve();
  assert.equal(await operation,true);assert.equal(commits,1);
  assert.ok(candidate.getTracks().every(t=>!t.enabled));
  manager.dispose();
});

test('hangup during replaceTrack immediately stops pending capture and prevents resurrection',async()=>{
  const manager=createMediaReplacement(),candidate=stream(),hold=deferred();let commits=0;
  const operation=manager.run({acquire:async()=>candidate,isCurrent:()=>true,
    senders:[{track:{kind:'audio'},replaceTrack:()=>hold.promise}],commit:()=>commits++});
  await new Promise(r=>setImmediate(r));manager.dispose();
  assert.ok(candidate.getTracks().every(t=>t.readyState==='ended'));
  hold.resolve();assert.equal(await operation,false);assert.equal(commits,0);
});

test('capture resolving after hangup is stopped without replacing any sender',async()=>{
  const manager=createMediaReplacement(),candidate=stream(),hold=deferred();let commits=0;
  const operation=manager.run({acquire:()=>hold.promise,isCurrent:()=>true,senders:[],commit:()=>commits++});
  manager.dispose();hold.resolve(candidate);
  assert.equal(await operation,false);assert.equal(commits,0);
  assert.ok(candidate.getTracks().every(t=>t.readyState==='ended'));
});

test('failed and overlapping replacements cannot leak capture',async()=>{
  const manager=createMediaReplacement(),candidate=stream(),hold=deferred();let acquired=0,commits=0;
  const options={acquire:async()=>{acquired++;return candidate;},isCurrent:()=>true,
    senders:[{track:{kind:'audio'},replaceTrack:async()=>{await hold.promise;throw new Error('device failed');}}],commit:()=>commits++};
  const first=manager.run(options);
  assert.equal(await manager.run(options),false);assert.equal(acquired,1);
  hold.resolve();await assert.rejects(first,/device failed/);
  assert.ok(candidate.getTracks().every(t=>t.readyState==='ended'));assert.equal(commits,0);
  manager.dispose();
});
