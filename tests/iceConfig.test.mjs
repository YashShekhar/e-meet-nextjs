import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {iceConfiguration} from '../src/lib/iceConfig.ts';

test('relay-only refuses missing credentials and never falls back to STUN',()=>{
  process.env.WEBRTC_RELAY_ONLY='true';
  try { assert.throws(()=>iceConfiguration(Date.now()+10000),{status:503}); }
  finally { delete process.env.WEBRTC_RELAY_ONLY; }
});
test('TURN credentials are time-limited, signed and disclose no shared secret',()=>{
  process.env.WEBRTC_RELAY_ONLY='true';
  process.env.TURN_URLS='turns:relay.example.com:5349?transport=tcp';
  process.env.TURN_SHARED_SECRET='a'.repeat(64);
  try {
    const config=iceConfiguration(Date.now()+7200000);
    assert.equal(config.iceTransportPolicy,'relay');assert.equal(config.iceServers.length,1);
    const server=config.iceServers[0];
    assert.equal(server.credential,crypto.createHmac('sha1',process.env.TURN_SHARED_SECRET).update(server.username).digest('base64'));
    assert.ok(Number(server.username.split(':')[0])<=Math.floor(Date.now()/1000)+7260);
    assert.equal(JSON.stringify(config).includes(process.env.TURN_SHARED_SECRET),false);
    process.env.TURN_URLS='turn:unencrypted.example.com';
    assert.throws(()=>iceConfiguration(Date.now()+1000),{status:503});
  }finally{delete process.env.WEBRTC_RELAY_ONLY;delete process.env.TURN_URLS;delete process.env.TURN_SHARED_SECRET;}
});
