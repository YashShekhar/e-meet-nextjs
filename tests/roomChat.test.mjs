import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRoomChat, isChatPacket, CHAT_LIMIT } from '../src/lib/roomChat.ts';
import { newInviteKey } from '../src/lib/callCrypto.ts';

import { createHostIdentity } from "../src/lib/invitation.ts";

class Connection extends EventEmitter {
  type='data';label='e-meet-secure-v3';open=false;sent=[];dataChannel={bufferedAmount:0};
  send(packet) { this.sent.push(packet); const other=this.other;queueMicrotask(()=>{if(other.open)other.emit('data',packet);}); }
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close');}}
}
const fp=byte=>'SHA-256 '+Array(32).fill(byte).join(':');
async function setup(t){
  const hp=new EventEmitter();hp.id='host';hp.connections={};
  const gp=new EventEmitter();gp.id='guest';gp.connections={};
  const hostConnection=new Connection();hostConnection.peer='guest';
  const guestConnection=new Connection();guestConnection.peer='host';
  hostConnection.other=guestConnection;guestConnection.other=hostConnection;
  hp.connect=(_peer,options)=>{assert.equal(options.serialization,'raw');gp.connections.host=[guestConnection];return hostConnection;};
  const messages=[];const errors=[];let resolveHost,resolveGuest;
  const readyHost=new Promise(r=>resolveHost=r),readyGuest=new Promise(r=>resolveGuest=r);
  const identity=await createHostIdentity();
  const common={hostPublicKey:identity.publicKey,expiresAt:Date.now()+60000,roomId:'ABCDEF-1234',inviteKey:newInviteKey(),onEnd:reason=>errors.push(reason),onMessage:m=>messages.push(m)};
  const host=createRoomChat({...common,peer:hp,remotePeerId:'guest',isHost:true,hostPrivateKey:identity.privateKey,localFingerprint:fp('AA'),remoteFingerprint:fp('BB'),onReady:resolveHost});
  const guest=createRoomChat({...common,peer:gp,remotePeerId:'host',isHost:false,localFingerprint:fp('BB'),remoteFingerprint:fp('AA'),onReady:resolveGuest});
  t.after(()=>{host.dispose();guest.dispose();});
  assert.equal(await host.send('Too early'),false);
  hostConnection.open=guestConnection.open=true;
  hostConnection.emit('open');guestConnection.emit('open');
  await Promise.all([readyHost,readyGuest]);
  return {host,guest,hostConnection,guestConnection,messages,errors,gp};
}
test('validates message sizes and types',()=>{
  const packet={type:'chat',id:crypto.randomUUID(),text:'hello'};
  assert.equal(isChatPacket(packet),true);
  for(const value of [null,{},'text',{...packet,text:' '},{...packet,text:'x'.repeat(CHAT_LIMIT+1)}])assert.equal(isChatPacket(value),false);
});
test('transport sends ciphertext only and adopts an early connection', {timeout:5000},async(t)=>{
  const {host,guest,hostConnection,messages}=await setup(t);
  assert.equal(await host.send('Private host message'),true);
  assert.equal(await guest.send('Private guest reply'),true);
  await new Promise(r=>setTimeout(r,30));
  assert.equal(messages.filter(m=>m.author==='peer').length,2);
  assert.equal(hostConnection.sent.some(packet=>packet.includes('Private host message')),false);
});
test('tampered traffic destroys the transport; late traffic cannot repopulate history',{timeout:5000},async(t)=>{
  const {host,guest,guestConnection,messages,errors}=await setup(t);
  const count=messages.length;
  guestConnection.emit('data',JSON.stringify({v:2,type:'sealed',sequence:2,ciphertext:'AAAA'}));
  await new Promise(r=>setTimeout(r,30));
  assert.ok(errors.length>0);
  assert.equal(await host.send('after close'),false);assert.equal(await guest.send('after close'),false);
  guestConnection.emit('data',JSON.stringify({type:'chat',id:crypto.randomUUID(),text:'late plaintext'}));
  assert.equal(messages.length,count);
});
test('oversized frames and floods fail closed',{timeout:5000},async(t)=>{
  const {guestConnection,errors}=await setup(t);
  guestConnection.emit('data','x'.repeat(16001));
  assert.ok(errors.length>0);
});

test('buffered traffic cannot revive a session after browser suspension',{timeout:5000},async(t)=>{
  const {host,messages,errors}=await setup(t);
  const now=Date.now();
  t.mock.method(Date,'now',()=>now+21000);
  await host.send('Buffered while the other tab was frozen');
  await new Promise(r=>setTimeout(r,30));
  assert.ok(errors.length>0);
  assert.equal(messages.filter(m=>m.author==='peer').length,0);
});
