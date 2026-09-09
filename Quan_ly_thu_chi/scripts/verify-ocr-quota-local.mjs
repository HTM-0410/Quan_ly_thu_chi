import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const webDirectory = join(projectDirectory, 'web');
const { createTestHarness, getPlatformProxy } = await import(
  pathToFileURL(join(webDirectory, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js')).href,
);
const evidencePath = join(
  projectDirectory,
  '..',
  'docs',
  'develop',
  'v1',
  'reports',
  'evidence',
  '20260908-ocr-quota-local-runtime.json',
);

const RATE_WINDOW_MS = 10 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT = 10;
const DAILY_LIMIT = 60;
const baseTime = Date.UTC(2030, 0, 1, 0, 0, 0);

function summarize(results) {
  return {
    allowed: results.filter(result => result.allowed).length,
    denied: results.filter(result => !result.allowed).length,
  };
}

async function readQuotaRow(worker, name) {
  const storage = await worker.getDurableObjectStorage('OCR_QUOTA', { name });
  const rows = await storage.exec(
    `SELECT id, window_started_at, window_count, day_started_at, day_count
       FROM ocr_quota
      WHERE id = 1`,
  );
  assert.equal(rows.length, 1, `expected one quota row for ${name}`);
  return rows[0];
}

async function main() {
  const server = createTestHarness({
    root: webDirectory,
    workers: [{ configPath: 'wrangler.toml' }],
  });

  await server.listen();
  try {
    const worker = server.getWorker();
    const env = await worker.getEnv();
    assert.ok(env.OCR_QUOTA, 'OCR_QUOTA binding was not created by Wrangler');

    const concurrentName = 'ocr:local-runtime-concurrency';
    const concurrentStub = env.OCR_QUOTA.getByName(concurrentName);
    const concurrentResults = await Promise.all(
      Array.from({ length: RATE_LIMIT * 2 }, () => concurrentStub.consume(baseTime)),
    );
    assert.equal(summarize(concurrentResults).allowed, RATE_LIMIT);
    assert.equal(summarize(concurrentResults).denied, RATE_LIMIT);
    assert.ok(concurrentResults.some(result => result.retryAfterSeconds === 600));

    const concurrentRow = await readQuotaRow(worker, concurrentName);
    assert.equal(concurrentRow.window_count, RATE_LIMIT);
    assert.equal(concurrentRow.day_count, RATE_LIMIT);

    const resetResult = await concurrentStub.consume(baseTime + RATE_WINDOW_MS);
    assert.equal(resetResult.allowed, true);
    assert.equal(resetResult.retryAfterSeconds, 0);
    const resetRow = await readQuotaRow(worker, concurrentName);
    assert.equal(resetRow.window_count, 1);
    assert.equal(resetRow.day_count, RATE_LIMIT + 1);

    const dailyName = 'ocr:local-runtime-daily';
    const dailyStub = env.OCR_QUOTA.getByName(dailyName);
    const dailyResults = [];
    for (let index = 0; index < DAILY_LIMIT; index += 1) {
      dailyResults.push(await dailyStub.consume(baseTime + index * RATE_WINDOW_MS));
    }
    assert.equal(summarize(dailyResults).allowed, DAILY_LIMIT);
    const dailyBlocked = await dailyStub.consume(baseTime + (DAILY_LIMIT - 1) * RATE_WINDOW_MS);
    assert.equal(dailyBlocked.allowed, false);
    assert.equal(
      dailyBlocked.retryAfterSeconds,
      Math.ceil((DAILY_WINDOW_MS - (DAILY_LIMIT - 1) * RATE_WINDOW_MS) / 1000),
    );
    const dailyRow = await readQuotaRow(worker, dailyName);
    assert.equal(dailyRow.window_count, 1);
    assert.equal(dailyRow.day_count, DAILY_LIMIT);

    const persistedFirst = { status: 'NOT_RUN', reason: 'getPlatformProxy does not instantiate internal DO classes' };
    const persistedSecond = persistedFirst;

    const evidence = {
      generatedAt: new Date().toISOString(),
      runtime: 'Wrangler createTestHarness (local Miniflare/workerd)',
      config: 'web/wrangler.toml',
      remoteBindings: false,
      providerContacted: false,
      binding: 'OCR_QUOTA -> OcrQuotaDurableObject',
      storage: 'SQLite Durable Object storage',
      assertions: {
        concurrentRequests: {
          requests: concurrentResults.length,
          ...summarize(concurrentResults),
          persistedRowAfterConcurrency: concurrentRow,
        },
        rateWindowReset: {
          result: resetResult,
          rowAfterReset: resetRow,
        },
        objectRestartPersistence: {
          firstProcessResult: persistedFirst,
          secondProcessResult: persistedSecond,
        },
        dailyLimit: {
          requests: dailyResults.length + 1,
          ...summarize(dailyResults),
          blockedResult: dailyBlocked,
          persistedRow: dailyRow,
        },
      },
    };
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
