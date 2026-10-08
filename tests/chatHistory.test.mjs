import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEncryptedHistory } from '../src/lib/chatHistory.ts';

test('encrypted tab history stays ordered, bounded, and cannot resume after disposal', async () => {
  const history = createEncryptedHistory(2);
  const message = i => ({id:String(i),text:'Secret '+i,author:'you'});
  const writes = [1,2,3].map(i=>history.append(message(i)));
  assert.deepEqual(await writes[0],[message(1)]);
  assert.deepEqual(await writes[1],[message(1),message(2)]);
  assert.deepEqual(await writes[2],[message(2),message(3)]);
  history.dispose();
  await assert.rejects(history.append(message(4)));
});

test('ending during pending encryption cannot bring cleared messages back', async () => {
  const history = createEncryptedHistory();
  const pending = history.append({id:'1',text:'Never restore this',author:'peer'});
  history.dispose();
  await assert.rejects(pending);
});

test('slow browsers cannot accumulate an unbounded pending history queue', async () => {
  const history = createEncryptedHistory();
  const writes = Array.from({length:33}, (_,i)=>history.append({id:String(i),text:'bounded',author:'peer'}));
  const results = await Promise.allSettled(writes);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,32);
  assert.equal(results[32].status,'rejected');
  history.dispose();
});
