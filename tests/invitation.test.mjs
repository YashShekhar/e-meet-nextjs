import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostIdentity, hostPeerIdentity, parseInvitation, invitationFragment, createAdmission, verifyAdmission } from '../src/lib/invitation.ts';
import { newInviteKey, createSecureSession } from '../src/lib/callCrypto.ts';

test('invitations bind an expiring secret to a fresh non-exportable host identity', async () => {
  const host = await createHostIdentity();
  await assert.rejects(crypto.subtle.exportKey('pkcs8', host.privateKey));
  const invitation = { key: newInviteKey(), host: host.publicKey, expires: Date.now()+60000 };
  assert.deepEqual(parseInvitation(invitationFragment(invitation)), invitation);
  for (const change of [{key:'invalid'},{host:''},{expires:Date.now()-1},{expires:Date.now()+86400000}]) {
    assert.throws(() => parseInvitation(invitationFragment({...invitation,...change})));
  }
  assert.notEqual(await hostPeerIdentity('ABCDEF-1234',host.publicKey), await hostPeerIdentity('ABCDEF-5678',host.publicKey));
  assert.notEqual(await hostPeerIdentity('ABCDEF-1234',host.publicKey), await hostPeerIdentity('ABCDEF-1234',(await createHostIdentity()).publicKey));
});

test('admission proof rejects outsiders, other identities, other rooms and expired/rebound invitations', async () => {
  const key = newInviteKey(), expires = Date.now()+60000;
  const proof = await createAdmission(key,'ABCDEF-1234','guest','host',expires);
  assert.equal(await verifyAdmission(proof,key,'ABCDEF-1234','guest','host',expires),true);
  for (const args of [
    [newInviteKey(),'ABCDEF-1234','guest','host',expires],
    [key,'ABCDEF-5678','guest','host',expires],
    [key,'ABCDEF-1234','other','host',expires],
    [key,'ABCDEF-1234','guest','other',expires],
    [key,'ABCDEF-1234','guest','host',expires+1],
    [key,'ABCDEF-1234','guest','host',Date.now()-1],
  ]) assert.equal(await verifyAdmission(proof,...args),false);
  assert.equal(await verifyAdmission({nonce:[],mac:[]},key,'ABCDEF-1234','guest','host',expires),false);
});

test('a guest who knows the invitation cannot impersonate its original host', async () => {
  const original = await createHostIdentity(), attacker = await createHostIdentity();
  const fp = byte => 'SHA-256 '+Array(32).fill(byte).join(':');
  const common = { roomId:'ABCDEF-1234',inviteKey:newInviteKey(),hostPublicKey:original.publicKey,expiresAt:Date.now()+60000 };
  const fake = await createSecureSession({...common,isHost:true,hostPrivateKey:attacker.privateKey,
    localPeerId:'host',remotePeerId:'guest',localFingerprint:fp('AA'),remoteFingerprint:fp('BB')});
  const guest = await createSecureSession({...common,isHost:false,
    localPeerId:'guest',remotePeerId:'host',localFingerprint:fp('BB'),remoteFingerprint:fp('AA')});
  try { await assert.rejects(guest.acceptHello(fake.hello),/Original host authentication failed/); }
  finally { fake.dispose();guest.dispose(); }
});
