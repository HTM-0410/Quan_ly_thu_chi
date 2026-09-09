import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Cloudflare Worker entry is JavaScript and is syntax-checked separately.
import worker from '../../_worker.js/index.js';

const OCR_BODY = JSON.stringify({
  contents: [{ parts: [{ inline_data: { mime_type: 'image/png', data: 'AAAA' } }] }],
});

function request(headers: Record<string, string> = {}, body = OCR_BODY) {
  return new Request('https://app.test/api/ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const baseEnv = {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  GEMINI_API_KEY: 'test-provider-secret',
};

function createQuotaNamespace({ consume = undefined as undefined | (() => Promise<unknown>) } = {}) {
  const states = new Map<string, { count: number }>();
  return {
    getByName(name: string) {
      let state = states.get(name);
      if (!state) {
        state = { count: 0 };
        states.set(name, state);
      }
      return {
        consume:
          consume ||
          (async () => {
            state!.count += 1;
            return state!.count <= 10
              ? { allowed: true, retryAfterSeconds: 0 }
              : { allowed: false, retryAfterSeconds: 600 };
          }),
      };
    },
  };
}

function envWithQuota(quota = createQuotaNamespace()) {
  return { ...baseEnv, OCR_QUOTA: quota };
}

afterEach(() => vi.unstubAllGlobals());

describe('Worker OCR proxy security boundary', () => {
  it('rejects anonymous requests before provider access', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await worker.fetch(request(), baseEnv);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid JWTs', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await worker.fetch(request({ Authorization: 'Bearer invalid' }), baseEnv);

    expect(response.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects non-JSON and oversized payloads', async () => {
    const fetchSpy = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: 'oversize-user' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const wrongType = await worker.fetch(
      request({ Authorization: 'Bearer valid', 'content-type': 'image/png' }),
      envWithQuota(),
    );
    expect(wrongType.status).toBe(415);

    const tooLarge = await worker.fetch(
      request({ Authorization: 'Bearer valid', 'content-length': String(13 * 1024 * 1024) }),
      envWithQuota(),
    );
    expect(tooLarge.status).toBe(413);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops reading a chunked body once the hard payload limit is reached', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'stream-user' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const consume = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    const quota = createQuotaNamespace({ consume });
    const bodyChunk = new Uint8Array(12 * 1024 * 1024 + 1);
    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bodyChunk);
        controller.close();
      },
    });
    const streamedRequest = new Request('https://app.test/api/ocr', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer valid' },
      body: bodyStream,
      duplex: 'half',
    } as RequestInit);

    const response = await worker.fetch(streamedRequest, envWithQuota(quota));

    expect(response.status).toBe(413);
    expect(consume).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards one valid request without putting the provider key in the URL', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'valid-user' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await worker.fetch(request({ Authorization: 'Bearer valid' }), envWithQuota());

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const upstreamRequest = fetchSpy.mock.calls[1]![1] as RequestInit;
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(upstreamRequest.headers).toMatchObject({ 'x-goog-api-key': 'test-provider-secret' });
    expect(String(fetchSpy.mock.calls[1]![0])).not.toContain('key=');
  });

  it('enforces the per-user quota', async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'quota-user' }), { status: 200 });
      }
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const quota = createQuotaNamespace();
    for (let i = 0; i < 10; i++) {
      expect((await worker.fetch(request({ Authorization: 'Bearer valid' }), envWithQuota(quota))).status).toBe(200);
    }
    const limited = await worker.fetch(request({ Authorization: 'Bearer valid' }), envWithQuota(quota));
    expect(limited.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(21); // auth + provider for the first 10, auth for the rejected 11th
  });

  it('fails closed when the shared quota binding is missing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'missing-limiter-user' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await worker.fetch(request({ Authorization: 'Bearer valid' }), baseEnv);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'OCR_QUOTA_UNAVAILABLE' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the shared quota service errors', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'failing-limiter-user' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const quota = createQuotaNamespace({ consume: vi.fn().mockRejectedValue(new Error('quota unavailable')) });

    const response = await worker.fetch(request({ Authorization: 'Bearer valid' }), envWithQuota(quota));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'OCR_QUOTA_UNAVAILABLE' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shares a user quota across separate Worker entry environments', async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'shared-user' }), { status: 200 });
      }
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    // Two request-serving environments represent separate Worker isolates;
    // they share only the namespace binding, as production instances do.
    const sharedQuota = createQuotaNamespace();
    const firstEntryEnv = envWithQuota(sharedQuota);
    const secondEntryEnv = envWithQuota(sharedQuota);
    for (let i = 0; i < 9; i++) {
      expect((await worker.fetch(request({ Authorization: 'Bearer valid' }), firstEntryEnv)).status).toBe(200);
    }
    expect((await worker.fetch(request({ Authorization: 'Bearer valid' }), secondEntryEnv)).status).toBe(200);
    const limited = await worker.fetch(request({ Authorization: 'Bearer valid' }), secondEntryEnv);

    expect(limited.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(21); // 10 auth + 10 provider calls, then auth for the rejected call
  });
});
