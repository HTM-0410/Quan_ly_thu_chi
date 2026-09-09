// Cloudflare Worker entry — SPA fallback and authenticated OCR proxy.
// Gemini credentials are Worker secrets only; never expose them to assets.

import { DurableObject } from 'cloudflare:workers';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OCR_MODEL = 'gemini-3.5-flash-lite';
const ALLOWED_OCR_MODELS = new Set([DEFAULT_OCR_MODEL, 'gemini-3.6-flash', 'gemini-2.5-flash']);
const OCR_PATHS = new Set(['/api/ocr', '/api/bill-ocr']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OCR_UPSTREAM_TIMEOUT_MS = 45_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_REQUESTS_PER_DAY = 60;

/**
 * One SQLite-backed Durable Object instance is addressed by each user id.
 * Durable Objects serialize calls for an instance and their storage is
 * strongly consistent, so the counters are shared across Worker isolates.
 */
export class OcrQuotaDurableObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS ocr_quota (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          window_started_at INTEGER NOT NULL,
          window_count INTEGER NOT NULL,
          day_started_at INTEGER NOT NULL,
          day_count INTEGER NOT NULL
        )
      `);
    });
  }

  consume(now = Date.now()) {
    const current = this.ctx.storage.sql.exec(
      `SELECT window_started_at, window_count, day_started_at, day_count
         FROM ocr_quota
        WHERE id = 1`,
    ).toArray()[0];

    const quota = current || {
      window_started_at: now,
      window_count: 0,
      day_started_at: now,
      day_count: 0,
    };

    if (now - quota.window_started_at >= RATE_WINDOW_MS) {
      quota.window_started_at = now;
      quota.window_count = 0;
    }
    if (now - quota.day_started_at >= DAILY_WINDOW_MS) {
      quota.day_started_at = now;
      quota.day_count = 0;
    }

    if (quota.window_count >= MAX_REQUESTS_PER_WINDOW || quota.day_count >= MAX_REQUESTS_PER_DAY) {
      // A daily cap cannot be lifted by the shorter rate window. Report the
      // reset that actually makes this request eligible again.
      const nextWindow =
        quota.day_count >= MAX_REQUESTS_PER_DAY
          ? quota.day_started_at + DAILY_WINDOW_MS
          : quota.window_started_at + RATE_WINDOW_MS;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((nextWindow - now) / 1000)),
      };
    }

    quota.window_count += 1;
    quota.day_count += 1;
    this.ctx.storage.sql.exec(
      `INSERT INTO ocr_quota (id, window_started_at, window_count, day_started_at, day_count)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         window_count = excluded.window_count,
         day_started_at = excluded.day_started_at,
         day_count = excluded.day_count`,
      quota.window_started_at,
      quota.window_count,
      quota.day_started_at,
      quota.day_count,
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (OCR_PATHS.has(url.pathname)) {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      return handleOcrRequest(request, env);
    }

    const assets = env.ASSETS;
    if (assets) {
      const assetResponse = await assets.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }

      // SPA fallback for React Router.
      const indexRequest = new Request(new URL('/index.html', url), request);
      return assets.fetch(indexRequest);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleOcrRequest(request, env) {
  const auth = await authenticateSupabaseUser(request, env);
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'OCR payload is too large' }, 413);
  }

  const bodyResult = await readBodyWithinLimit(request, MAX_BODY_BYTES);
  if (bodyResult.tooLarge) {
    return jsonResponse({ error: 'OCR payload is too large' }, 413);
  }
  if (!bodyResult.ok) {
    return jsonResponse({ error: 'Invalid OCR payload' }, 400);
  }
  const bodyText = bodyResult.text;

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: 'Invalid OCR JSON' }, 400);
  }
  if (!isSupportedGenerateContentPayload(body)) {
    return jsonResponse({ error: 'Invalid OCR payload schema' }, 400);
  }

  const model = String(env.OCR_MODEL || DEFAULT_OCR_MODEL).trim();
  if (!ALLOWED_OCR_MODELS.has(model)) {
    return jsonResponse({ error: 'OCR model is not allowed' }, 400);
  }
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse({ error: 'OCR service is not configured' }, 503);
  }

  const quota = await consumeQuota(env, auth.userId);
  if (!quota.ok) {
    return quota.response;
  }
  if (!quota.result.allowed) {
    return jsonResponse(
      { error: 'OCR rate limit exceeded', code: 'OCR_QUOTA_EXCEEDED' },
      429,
      { 'Retry-After': String(quota.result.retryAfterSeconds) },
    );
  }

  const upstreamController = new AbortController();
  const upstreamTimeoutId = setTimeout(() => upstreamController.abort(), OCR_UPSTREAM_TIMEOUT_MS);
  try {
    const upstreamResponse = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: bodyText,
        signal: upstreamController.signal,
      },
    );

    if (upstreamResponse.ok) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const retryAfter = upstreamResponse.headers.get('Retry-After');
    return jsonResponse(
      { error: 'OCR provider unavailable', code: 'OCR_UPSTREAM_ERROR' },
      upstreamResponse.status === 429 ? 429 : 502,
      retryAfter && upstreamResponse.status === 429 ? { 'Retry-After': retryAfter } : undefined,
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      return jsonResponse({ error: 'OCR provider timed out', code: 'OCR_UPSTREAM_TIMEOUT' }, 504);
    }
    return jsonResponse({ error: 'OCR provider unavailable', code: 'OCR_UPSTREAM_ERROR' }, 502);
  } finally {
    clearTimeout(upstreamTimeoutId);
  }
}

async function readBodyWithinLimit(request, maxBytes) {
  if (!request.body) {
    return { ok: true, text: '' };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || typeof value.byteLength !== 'number') {
        await reader.cancel();
        return { ok: false, tooLarge: false };
      }
      const chunk =
        value instanceof Uint8Array
          ? value
          : new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(chunk);
    }
  } catch {
    return { ok: false, tooLarge: false };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

async function authenticateSupabaseUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return { ok: false, response: jsonResponse({ error: 'Authentication required' }, 401) };
  }

  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: jsonResponse({ error: 'OCR authentication is not configured' }, 503) };
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authorization,
      },
    });
    if (!response.ok) {
      return { ok: false, response: jsonResponse({ error: 'Invalid authentication' }, 401) };
    }
    const user = await response.json();
    if (!user || typeof user.id !== 'string' || user.id.length === 0) {
      return { ok: false, response: jsonResponse({ error: 'Invalid authentication' }, 401) };
    }
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, response: jsonResponse({ error: 'Authentication service unavailable' }, 503) };
  }
}

async function consumeQuota(env, userId) {
  const limiter = env?.OCR_QUOTA;
  if (!limiter || typeof limiter.getByName !== 'function') {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'OCR quota service is not configured', code: 'OCR_QUOTA_UNAVAILABLE' },
        503,
      ),
    };
  }

  try {
    const stub = limiter.getByName(`ocr:${userId}`);
    if (!stub || typeof stub.consume !== 'function') {
      throw new Error('OCR quota binding returned an invalid stub');
    }
    const result = await stub.consume();
    if (
      !result ||
      typeof result.allowed !== 'boolean' ||
      !Number.isFinite(result.retryAfterSeconds) ||
      result.retryAfterSeconds < 0
    ) {
      throw new Error('OCR quota binding returned an invalid result');
    }
    return { ok: true, result };
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'OCR quota service unavailable', code: 'OCR_QUOTA_UNAVAILABLE' },
        503,
      ),
    };
  }
}

function isSupportedGenerateContentPayload(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.contents) || body.contents.length !== 1) {
    return false;
  }

  let totalImageBytes = 0;
  let hasImage = false;
  for (const content of body.contents) {
    if (!content || typeof content !== 'object' || !Array.isArray(content.parts) || content.parts.length < 1 || content.parts.length > 8) {
      return false;
    }
    for (const part of content.parts) {
      if (!part || typeof part !== 'object') return false;
      if (part.text !== undefined && (typeof part.text !== 'string' || part.text.length > 64 * 1024)) {
        return false;
      }
      if (part.inline_data !== undefined) {
        const image = part.inline_data;
        if (!image || typeof image !== 'object' || !IMAGE_MIME_TYPES.has(String(image.mime_type).toLowerCase())) {
          return false;
        }
        if (typeof image.data !== 'string' || !isBase64(image.data)) return false;
        const imageBytes = Math.floor(image.data.length * 3 / 4) - (image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0);
        if (imageBytes <= 0 || imageBytes > MAX_IMAGE_BYTES) return false;
        totalImageBytes += imageBytes;
        hasImage = true;
      }
    }
  }

  if (body.systemInstruction !== undefined && !isPromptObject(body.systemInstruction)) return false;
  return hasImage && totalImageBytes <= MAX_IMAGE_BYTES;
}

function isPromptObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.parts) &&
      value.parts.length <= 8 &&
      value.parts.every(part => part && typeof part.text === 'string' && part.text.length <= 64 * 1024),
  );
}

function isBase64(value) {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
