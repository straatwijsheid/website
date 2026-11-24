// Straatwijsheid contribution form: receives a submission from https://straatwijsheid.nl/meedoen/,
// checks it, and opens a public issue in the knowledge repository. The optional email never goes into the
// issue: it is kept in Workers KV under the issue number and expires after 90 days.

const MAX_BODY_BYTES = 12_000;
const EMAIL_TTL_SECONDS = 90 * 24 * 60 * 60;
const LIMITS = { street: 120, gemeente: 80, answer: 2000, source: 500, name: 80, email: 254 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(env, origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const text = (s) => String(s ?? '').replace(/\r\n?/g, '\n').trim();

/** Validate and normalise the fields. Returns { value } or { error, field }. */
export function validate(input) {
  if (!input || typeof input !== 'object') return { error: 'invalid', field: null };
  const v = {
    street: oneLine(input.street),
    gemeente: oneLine(input.gemeente),
    answer: text(input.answer),
    source: oneLine(input.source),
    name: oneLine(input.name),
    email: oneLine(input.email),
  };
  for (const f of ['street', 'gemeente', 'answer']) if (!v[f]) return { error: 'required', field: f };
  for (const [f, max] of Object.entries(LIMITS)) if (v[f].length > max) return { error: 'too_long', field: f };
  if (v.email && !EMAIL_RE.test(v.email)) return { error: 'email', field: 'email' };
  if (input.consent !== true && input.consent !== 'on' && input.consent !== 'true') return { error: 'consent', field: 'consent' };
  return { value: v };
}

/** Stop user text from pinging people (@name) or closing our quote block. */
const defang = (s) => s.replace(/@(?=\w)/g, '@​');
const quote = (s) => defang(s).split('\n').map((l) => `> ${l}`).join('\n');

export function issueFrom(v) {
  const title = `[form] ${defang(v.street)}, ${defang(v.gemeente)}`.slice(0, 140);
  const lines = [
    '*Submitted through the website form. Not yet checked.*',
    '',
    `**Street:** ${defang(v.street)}`,
    `**Gemeente:** ${defang(v.gemeente)}`,
    '',
    '**Proposed answer**',
    quote(v.answer),
  ];
  if (v.source) lines.push('', `**Source:** ${defang(v.source)}`);
  lines.push('', `**Name (as the contributor wants to be credited):** ${v.name ? defang(v.name) : '*not given*'}`);
  lines.push(`**Contact:** ${v.email ? 'on file (kept privately, not in this issue)' : 'none given'}`);
  lines.push('**Consent:** the contributor agreed the answer may be published under CC-BY 4.0.');
  return { title, body: lines.join('\n') };
}

async function verifyTurnstile(env, token, ip) {
  if (!token) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) form.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  if (!r.ok) return false;
  return (await r.json()).success === true;
}

async function createIssue(env, issue) {
  const r = await fetch(`https://api.github.com/repos/${env.ISSUE_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'straatwijsheid-form-worker',
    },
    body: JSON.stringify({ title: issue.title, body: issue.body, labels: ['from-form'] }),
  });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const j = await r.json();
  return { number: j.number, url: j.html_url };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = origin && origin === env.ALLOWED_ORIGIN;
    const headers = allowed ? cors(env, origin) : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers });
    const url = new URL(request.url);
    if (url.pathname !== '/submit') return json(404, { ok: false, error: 'not_found' });
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method' }, { Allow: 'POST, OPTIONS' });
    if (!allowed) return json(403, { ok: false, error: 'origin' });

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too_large' }, headers);
    let input;
    try { input = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'invalid' }, headers); }

    // Honeypot: real people never see this field. Pretend it worked so bots learn nothing.
    if (input && typeof input.website === 'string' && input.website !== '') return json(200, { ok: true }, headers);

    const checked = validate(input);
    if (checked.error) return json(422, { ok: false, error: checked.error, field: checked.field }, headers);

    const ip = request.headers.get('CF-Connecting-IP');
    if (!(await verifyTurnstile(env, input['cf-turnstile-response'], ip))) {
      return json(403, { ok: false, error: 'turnstile' }, headers);
    }
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip || 'unknown' })).success) {
      return json(429, { ok: false, error: 'rate_limited' }, headers);
    }

    let issue;
    try {
      issue = await createIssue(env, issueFrom(checked.value));
    } catch (e) {
      console.error('issue creation failed:', e.message);   // never log the submission itself
      return json(502, { ok: false, error: 'upstream' }, headers);
    }

    if (checked.value.email) {
      try {
        await env.EMAILS.put(`email:${issue.number}`, JSON.stringify({ email: checked.value.email, name: checked.value.name || null }),
          { expirationTtl: EMAIL_TTL_SECONDS });
      } catch (e) {
        console.error(`storing contact for issue ${issue.number} failed:`, e.message);
      }
    }
    return json(200, { ok: true, issue: issue.number, url: issue.url }, headers);
  },
};
