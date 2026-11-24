import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validate, issueFrom } from '../src/index.js';

const ORIGIN = 'https://straatwijsheid.nl';
const good = { street: 'Kerkstraat', gemeente: 'Zundert', answer: 'Named after the church.', source: '', name: '', email: '', consent: true, 'cf-turnstile-response': 'tok' };

function env(over = {}) {
  const kv = new Map();
  return { ISSUE_REPO: 'straatwijsheid/knowledge', ALLOWED_ORIGIN: ORIGIN, GH_TOKEN: 't', TURNSTILE_SECRET: 's',
    EMAILS: { put: async (k, v, o) => kv.set(k, { v, o }), kv }, ...over };
}

function stubFetch({ turnstile = true, github = 201 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('turnstile')) return new Response(JSON.stringify({ success: turnstile }));
    return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/straatwijsheid/knowledge/issues/42' }), { status: github });
  };
  return calls;
}

const post = (body, headers = {}) => new Request('https://w.example/submit', {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('valid submission creates a labelled issue and returns its number', async () => {
  const calls = stubFetch(); const e = env();
  const r = await worker.fetch(post(good), e);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).issue, 42);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const gh = calls.find((c) => c.url.includes('api.github.com'));
  assert.equal(gh.url, 'https://api.github.com/repos/straatwijsheid/knowledge/issues');
  assert.deepEqual(JSON.parse(gh.init.body).labels, ['from-form']);
  assert.equal(e.EMAILS.kv.size, 0);
});

test('the email is stored in KV with a 90-day expiry and never appears in the issue', async () => {
  const calls = stubFetch(); const e = env();
  const r = await worker.fetch(post({ ...good, email: 'a@b.nl', name: 'An' }), e);
  assert.equal(r.status, 200);
  const gh = calls.find((c) => c.url.includes('api.github.com'));
  assert.ok(!gh.init.body.includes('a@b.nl'));
  assert.ok(gh.init.body.includes('on file'));
  const stored = e.EMAILS.kv.get('email:42');
  assert.equal(JSON.parse(stored.v).email, 'a@b.nl');
  assert.equal(stored.o.expirationTtl, 7776000);
});

test('wrong or missing origin is refused before anything else happens', async () => {
  const calls = stubFetch();
  assert.equal((await worker.fetch(post(good, { Origin: 'https://evil.example' }), env())).status, 403);
  const noOrigin = new Request('https://w.example/submit', { method: 'POST', body: JSON.stringify(good) });
  assert.equal((await worker.fetch(noOrigin, env())).status, 403);
  assert.equal(calls.length, 0);
});

test('preflight is answered for the site only', async () => {
  const ok = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
  assert.equal(ok.status, 204);
  const no = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: 'https://x.example' } }), env());
  assert.equal(no.status, 403);
});

test('a filled honeypot looks like success but does nothing', async () => {
  const calls = stubFetch();
  const r = await worker.fetch(post({ ...good, website: 'http://spam' }), env());
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
});

test('a failed Turnstile check is refused and no issue is created', async () => {
  const calls = stubFetch({ turnstile: false });
  const r = await worker.fetch(post(good), env());
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'turnstile');
  assert.ok(!calls.some((c) => c.url.includes('api.github.com')));
});

test('a missing token reports missing-token', async () => {
  stubFetch();
  const { 'cf-turnstile-response': _drop, ...noToken } = good;
  const r = await worker.fetch(post(noToken), env());
  assert.deepEqual((await r.json()).codes, ['missing-token']);
});

test('GitHub failing gives a generic 502 and stores nothing', async () => {
  stubFetch({ github: 500 }); const e = env();
  const r = await worker.fetch(post({ ...good, email: 'a@b.nl' }), e);
  assert.equal(r.status, 502);
  assert.equal(e.EMAILS.kv.size, 0);
});

test('a KV failure does not lose the submission', async () => {
  stubFetch(); const e = env({ EMAILS: { put: async () => { throw new Error('kv down'); } } });
  const r = await worker.fetch(post({ ...good, email: 'a@b.nl' }), e);
  assert.equal(r.status, 200);
});

test('rate limiter, when bound, is applied', async () => {
  const calls = stubFetch();
  const r = await worker.fetch(post(good), env({ LIMITER: { limit: async () => ({ success: false }) } }));
  assert.equal(r.status, 429);
  assert.ok(!calls.some((c) => c.url.includes('api.github.com')));
});

test('validation: required, length, email, consent', () => {
  assert.equal(validate({ ...good, street: '  ' }).field, 'street');
  assert.equal(validate({ ...good, answer: 'x'.repeat(2001) }).error, 'too_long');
  assert.equal(validate({ ...good, email: 'nope' }).field, 'email');
  assert.equal(validate({ ...good, consent: false }).field, 'consent');
  assert.equal(validate(null).error, 'invalid');
  assert.ok(validate(good).value);
});

test('invalid JSON and oversize bodies are rejected', async () => {
  stubFetch();
  const bad = new Request('https://w.example/submit', { method: 'POST', headers: { Origin: ORIGIN }, body: '{nope' });
  assert.equal((await worker.fetch(bad, env())).status, 400);
  const big = new Request('https://w.example/submit', { method: 'POST', headers: { Origin: ORIGIN }, body: 'x'.repeat(13000) });
  assert.equal((await worker.fetch(big, env())).status, 413);
});

test('user text cannot ping people or break the quote block', () => {
  const { title, body } = issueFrom({ street: '@alice street', gemeente: 'Z', answer: 'hi @bob\nsecond line', source: '', name: '@carol', email: '' });
  for (const s of [title, body]) assert.ok(!/@(?=\w)/.test(s));
  assert.ok(body.includes('> second line'));
});
