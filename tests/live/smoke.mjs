// Opt-in live smoke test: runs the Node proxy in-process against api.satelit.md.
// Costs about 2 credits (rates + fuel).   SATELIT_API_KEY=sat_live_… npm run smoke
import assert from 'node:assert/strict';
import { createProxy } from '../../proxy/node/server.mjs';

if (!process.env.SATELIT_API_KEY) {
  console.log('SATELIT_API_KEY not set: live smoke test skipped.');
  process.exit(0);
}
const { server, stats } = createProxy({ origins: ['*'] });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const rates = await (await fetch(base + '/rates?lang=en')).json();
  const eur = rates.data.find((r) => r.code === 'EUR');
  assert.ok(eur && eur.value > 0, 'EUR rate');
  assert.match(rates.meta.attribution, /bnm\.md/);
  const again = await fetch(base + '/rates?lang=en');
  assert.equal(again.headers.get('x-cache'), 'HIT');
  const fuel = await (await fetch(base + '/fuel')).json();
  assert.ok(fuel.data.networks.length > 0, 'fuel networks');
  console.log(`ok: EUR ${eur.value} MDL on ${eur.date}; ${fuel.data.networks.length} fuel networks; upstream calls ${stats.upstream}; credits left ${stats.credits_remaining}`);
} finally {
  server.close();
}
