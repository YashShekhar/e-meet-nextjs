import { test } from "node:test";
import assert from "node:assert/strict";
import { createSecureSession, newInviteKey, mediaFingerprint } from "../src/lib/callCrypto.ts";

import { createHostIdentity } from "../src/lib/invitation.ts";

const fingerprint = (byte) => 'SHA-256 ' + Array(32).fill(byte).join(':');
async function pair(t, key = newInviteKey()) {
  const identity = await createHostIdentity();
  const shared = { roomId: 'ABCDEF-1234', inviteKey: key, hostPublicKey: identity.publicKey, expiresAt: Date.now()+60000 };
  const host = await createSecureSession({ ...shared, localPeerId:'host', remotePeerId:'guest', isHost:true, hostPrivateKey:identity.privateKey,
    localFingerprint:fingerprint('AA'), remoteFingerprint:fingerprint('BB') });
  const guest = await createSecureSession({ ...shared, localPeerId:'guest', remotePeerId:'host', isHost:false,
    localFingerprint:fingerprint('BB'), remoteFingerprint:fingerprint('AA') });
  t.after(()=>{host.dispose();guest.dispose();});
  return {host,guest};
}
test('fresh authenticated keys encrypt both directions and produce matching verification codes', async (t)=>{
  const {host,guest}=await pair(t);
  await Promise.all([host.acceptHello(guest.hello),guest.acceptHello(host.hello)]);
  assert.equal(host.securityCode(),guest.securityCode());
  assert.equal(host.securityCode().length,39);
  const packet=await host.encrypt({type:'chat',text:'private message'});
  assert.equal(JSON.stringify(packet).includes('private message'),false);
  assert.deepEqual(await guest.decrypt(packet),{type:'chat',text:'private message'});
  assert.deepEqual(await host.decrypt(await guest.encrypt({text:'reply'})),{text:'reply'});
});
test('rejects forged invitations, identities, roles and substituted media certificates',async(t)=>{
  const {host,guest}=await pair(t);
  for(const changed of [{mac:'0'.repeat(64)},{from:'intruder'},{role:'host'},
    {fingerprint:fingerprint('CC')},{room:'OTHER1-1234'},{publicKey:'A'.repeat(88)}]) {
    await assert.rejects(host.acceptHello({...guest.hello,...changed}));
  }
  const other=await pair(t);
  await assert.rejects(host.acceptHello(other.guest.hello));
});
test('rejects tampering, replay, reflection and cross-session ciphertext',async(t)=>{
  const {host,guest}=await pair(t);
  await Promise.all([host.acceptHello(guest.hello),guest.acceptHello(host.hello)]);
  const encrypted=await host.encrypt({text:'secret'});
  const bytes=Buffer.from(encrypted.ciphertext,'base64');bytes[0]^=1;
  await assert.rejects(guest.decrypt({...encrypted,ciphertext:bytes.toString('base64')}));
  await assert.rejects(host.decrypt(encrypted));
  await guest.decrypt(encrypted);
  await assert.rejects(guest.decrypt(encrypted));
  const other=await pair(t);await other.guest.acceptHello(other.host.hello);
  await assert.rejects(other.guest.decrypt(encrypted));
});
test('ending a session prevents all further encryption, decryption and handshakes',async(t)=>{
  const {host,guest}=await pair(t);
  await Promise.all([host.acceptHello(guest.hello),guest.acceptHello(host.hello)]);
  const packet=await guest.encrypt({text:'late'});
  host.dispose();
  assert.equal(host.securityCode(),'');
  await assert.rejects(host.encrypt({text:'late'}));
  await assert.rejects(host.decrypt(packet));
  await assert.rejects(host.acceptHello(guest.hello));
});
test('SDP must use one SHA-256 certificate',async()=>{
  assert.equal(mediaFingerprint('a=fingerprint:'+fingerprint('AA')+'\r\n'),fingerprint('AA'));
  assert.throws(()=>mediaFingerprint('a=fingerprint:sha-1 00'));
  assert.throws(()=>mediaFingerprint('a=fingerprint:'+fingerprint('AA')+'\r\na=fingerprint:'+fingerprint('BB')));
});

test('expired calls reject queued encryption and decryption even before a delayed timer runs',async(t)=>{
  const {host,guest}=await pair(t);
  await Promise.all([host.acceptHello(guest.hello),guest.acceptHello(host.hello)]);
  const packet=await host.encrypt({text:'buffered'});
  const now=Date.now();
  t.mock.method(Date,'now',()=>now+120000);
  await assert.rejects(guest.decrypt(packet));
  await assert.rejects(host.encrypt({text:'too late'}));
  await assert.rejects(guest.acceptHello(host.hello));
});
