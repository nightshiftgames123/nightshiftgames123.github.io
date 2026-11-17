// Copyright (c) 2026 Nightshift Games (Night Shift Studio). All rights reserved. See ../safeplate/LICENSE.txt.
// SafePlate AI server (Cloudflare Worker).
//
// What it does:
//   - keeps the Gemini API key on the server, so the app works without each user creating a key;
//   - counts uses per device, per internet connection and in total, per day (UTC);
//   - only forwards the two request shapes SafePlate uses (chef chat and label scan), with size limits,
//     so the endpoint is not a general-purpose free Gemini proxy.
//
// What it does not do: it has no accounts and keeps no chats or photos. The only thing stored is
// today's counters, keyed by the app's random device id and by a one-way hash of the IP address;
// they are wiped when the day changes.
import { DurableObject } from 'cloudflare:workers';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_CHAT_BYTES = 120 * 1024;
const MAX_SCAN_BYTES = 3 * 1024 * 1024;

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
const today = () => new Date().toISOString().slice(0, 10);

async function hashIp(ip, day) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(day + '|' + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device',
    'Access-Control-Expose-Headers': 'X-Uses-Left, X-Uses-Limit',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}
const fail = (status, code, message, headers) => json(status, { error: { code, message } }, headers);

// Build the Gemini request for a chef chat message. Returns a string on bad input.
function chatBody(b) {
  if (!b || typeof b.system !== 'string' || b.system.length > 8000) return 'bad system prompt';
  if (!Array.isArray(b.contents) || !b.contents.length || b.contents.length > 24) return 'bad conversation';
  let total = 0;
  const contents = [];
  for (const m of b.contents) {
    if (!m || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string' || !m.text) return 'bad message';
    total += m.text.length;
    contents.push({ role: m.role, parts: [{ text: m.text }] });
  }
  if (total > 24000) return 'conversation too long';
  if (contents[contents.length - 1].role !== 'user') return 'last message must be from the user';
  return {
    systemInstruction: { parts: [{ text: b.system }] },
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 4096 }
  };
}

// Build the Gemini request for a label photo.
function scanBody(b) {
  if (!b || typeof b.image !== 'string' || b.image.length < 100 || !/^[A-Za-z0-9+/]+=*$/.test(b.image)) return 'bad image';
  if (typeof b.prompt !== 'string' || !b.prompt || b.prompt.length > 4000) return 'bad prompt';
  if (!b.schema || typeof b.schema !== 'object' || JSON.stringify(b.schema).length > 4000) return 'bad schema';
  return {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: b.image } }, { text: b.prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: b.schema, maxOutputTokens: 4096 }
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return fail(403, 'forbidden', 'This server only answers the SafePlate app.');
    const ch = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });

    const device = request.headers.get('X-Device') || '';
    if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return fail(400, 'bad_request', 'Missing device id.', ch);

    const caps = { device: int(env.DAILY_FREE, 5), ip: int(env.DAILY_PER_IP, 20), total: int(env.DAILY_TOTAL, 1500) };
    const day = today();
    const ip = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', day);
    const limiter = env.LIMITER.get(env.LIMITER.idFromName('global'));
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'GET' && path === '/status') {
      const left = await limiter.peek(day, device, ip, caps);
      return json(200, { left, limit: caps.device }, ch);
    }
    if (request.method !== 'POST' || (path !== '/chat' && path !== '/scan')) return fail(404, 'not_found', 'Unknown address.', ch);
    if (!env.GEMINI_API_KEY) return fail(503, 'not_configured', 'The server has no Gemini key yet.', ch);

    const max = path === '/scan' ? MAX_SCAN_BYTES : MAX_CHAT_BYTES;
    if (int(request.headers.get('Content-Length'), 0) > max) return fail(413, 'bad_request', 'Request too large.', ch);
    const raw = await request.text();
    if (raw.length > max) return fail(413, 'bad_request', 'Request too large.', ch);
    let input;
    try { input = JSON.parse(raw); } catch (e) { return fail(400, 'bad_request', 'Not JSON.', ch); }
    const body = path === '/scan' ? scanBody(input) : chatBody(input);
    if (typeof body === 'string') return fail(400, 'bad_request', body, ch);

    // Count the use first, so parallel requests cannot slip past the limit; give it back if Gemini fails.
    const got = await limiter.take(day, device, ip, caps);
    if (!got.ok) {
      return got.reason === 'total'
        ? fail(429, 'busy_today', 'The free AI has reached its limit for today.', { ...ch, 'X-Uses-Left': '0', 'X-Uses-Limit': String(caps.device) })
        : fail(429, 'daily_limit', 'No free AI uses left today.', { ...ch, 'X-Uses-Left': '0', 'X-Uses-Limit': String(caps.device) });
    }
    const uses = { 'X-Uses-Left': String(got.left), 'X-Uses-Limit': String(caps.device) };

    const model = env.GEMINI_MODEL || 'gemini-3-flash-preview';
    const method = path === '/scan' ? ':generateContent' : ':streamGenerateContent?alt=sse';
    let up;
    try {
      up = await fetch((env.GEMINI_BASE || GEMINI_BASE) + '/models/' + encodeURIComponent(model) + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(body)
      });
    } catch (e) {
      await limiter.refund(day, device, ip);
      return fail(502, 'upstream', 'Could not reach the AI service.', ch);
    }
    if (!up.ok) {
      await limiter.refund(day, device, ip);
      // Do not pass Google's error text on: it can mention the key or the project.
      console.log('gemini error', up.status, (await up.text()).slice(0, 300));
      return fail(up.status === 429 ? 503 : 502, 'upstream', 'The AI service is busy or unavailable. Try again shortly.', ch);
    }
    return new Response(up.body, {
      status: 200,
      headers: { 'Content-Type': path === '/scan' ? 'application/json' : 'text/event-stream', 'Cache-Control': 'no-store', ...ch, ...uses }
    });
  }
};

// One small object holds today's counters for everyone.
export class Limiter extends DurableObject {
  async roll(day) {
    if ((await this.ctx.storage.get('day')) !== day) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.put('day', day);
    }
  }
  async read(device, ip) {
    const m = await this.ctx.storage.get(['d:' + device, 'i:' + ip, 'total']);
    return { d: m.get('d:' + device) || 0, i: m.get('i:' + ip) || 0, t: m.get('total') || 0 };
  }
  async peek(day, device, ip, caps) {
    await this.roll(day);
    const c = await this.read(device, ip);
    if (c.t >= caps.total) return 0;
    return Math.max(0, Math.min(caps.device - c.d, caps.ip - c.i));
  }
  async take(day, device, ip, caps) {
    await this.roll(day);
    const c = await this.read(device, ip);
    if (c.t >= caps.total) return { ok: false, reason: 'total' };
    if (c.d >= caps.device || c.i >= caps.ip) return { ok: false, reason: 'device' };
    await this.ctx.storage.put({ ['d:' + device]: c.d + 1, ['i:' + ip]: c.i + 1, total: c.t + 1 });
    return { ok: true, left: Math.max(0, Math.min(caps.device - c.d - 1, caps.ip - c.i - 1)) };
  }
  async refund(day, device, ip) {
    await this.roll(day);
    const c = await this.read(device, ip);
    await this.ctx.storage.put({ ['d:' + device]: Math.max(0, c.d - 1), ['i:' + ip]: Math.max(0, c.i - 1), total: Math.max(0, c.t - 1) });
  }
}
