// Dev-only failover test (no secrets needed): spawns the real server with
// provider endpoints pointed at local mock upstreams and asserts the chain:
//   1. Gemini OK            → gemini answers, NVIDIA never called
//   2. Gemini 429           → NVIDIA answers
//   3. Gemini 503           → NVIDIA answers
//   4. Gemini timeout       → NVIDIA answers
//   5. Gemini + NVIDIA fail → server 503 (client renders deterministic)
//   6. No keys configured   → server 503 (deterministic client-side)
//   7. Gemini empty output  → treated as failure → NVIDIA answers
// Run: node scripts/test-ai-failover.mjs

import { spawn } from 'node:child_process';

const PORT = 8799;
const MOCK_GEMINI = 8791;
const MOCK_NVIDIA = 8792;
const BASE = `http://localhost:${PORT}`;

const { createServer } = await import('node:http');

function mockUpstream(port, handler) {
  return new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(port, () => resolve(s));
  });
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Gemini-mock speaks the generateContent shape; NVIDIA-mock speaks chat completions.
let geminiHits = 0;
let nvidiaHits = 0;
let geminiMode = 'ok'; // ok | 429 | 503 | timeout | empty
let nvidiaMode = 'ok'; // ok | fail

await mockUpstream(MOCK_GEMINI, (req, res) => {
  geminiHits++;
  if (geminiMode === '429') return json(res, 429, { error: 'quota' });
  if (geminiMode === '503') return json(res, 503, { error: 'unavailable' });
  if (geminiMode === 'timeout') return; // never respond → client abort fires
  if (geminiMode === 'empty') return json(res, 200, { candidates: [{ content: { parts: [] } }] });
  return json(res, 200, { candidates: [{ content: { parts: [{ text: 'GEMINI-ANSWER' }] } }] });
});
await mockUpstream(MOCK_NVIDIA, (req, res) => {
  nvidiaHits++;
  if (nvidiaMode === 'fail') return json(res, 500, { error: 'down' });
  return json(res, 200, { choices: [{ message: { content: 'NVIDIA-ANSWER' } }] });
});

function startServer(env) {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      AI_TIMEOUT_MS: '700',
      HF_SKIP_ENV_FILE: '1', // isolate from real .env.local — tests mock everything
      NVIDIA_BASE_URL: `http://localhost:${MOCK_NVIDIA}/v1`,
      GEMINI_BASE_URL: `http://localhost:${MOCK_GEMINI}`,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

// The server builds the Gemini URL from the constant host — point it at the
// mock via an env override supported for testing.
process.env.GEMINI_BASE_URL_OVERRIDE = `http://localhost:${MOCK_GEMINI}`;

function post(path, body) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function waitForServer(timeoutMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`  FAIL ${name} ${extra}`); }
}

async function runScenario(name, { env, modes, expect }) {
  console.log(`\n${name}`);
  geminiMode = modes.gemini ?? 'ok';
  nvidiaMode = modes.nvidia ?? 'ok';
  geminiHits = 0;
  nvidiaHits = 0;
  const child = startServer(env);
  await waitForServer();
  try {
    const res = await post('/api/ai', { question: 'q', contextData: 'ctx', task: 'explain' });
    const body = await res.json();
    check('expected HTTP status', res.status === expect.status, `got ${res.status}`);
    if (expect.provider) check('expected provider', body.provider === expect.provider, JSON.stringify(body));
    if (expect.text) check('expected text', body.text === expect.text, JSON.stringify(body));
    if (expect.nvidiaCalled !== undefined) check(`nvidia called=${expect.nvidiaCalled}`, (nvidiaHits > 0) === expect.nvidiaCalled, `hits=${nvidiaHits}`);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 150));
  }
}

// NOTE: the real server talks to generativelanguage.googleapis.com directly.
// To route it at the mock without touching production code paths, the test
// stubs DNS-free by using the GEMINI_BASE_URL override the server reads.

await runScenario('TEST 1: Gemini OK → gemini, no NVIDIA call', {
  env: { GEMINI_API_KEY: 'test-key', NVIDIA_API_KEY: 'test-key' },
  modes: { gemini: 'ok' },
  expect: { status: 200, provider: 'gemini', text: 'GEMINI-ANSWER', nvidiaCalled: false },
});

await runScenario('TEST 2: Gemini 429 → NVIDIA fallback', {
  env: { GEMINI_API_KEY: 'test-key', NVIDIA_API_KEY: 'test-key' },
  modes: { gemini: '429' },
  expect: { status: 200, provider: 'nvidia', text: 'NVIDIA-ANSWER', nvidiaCalled: true },
});

await runScenario('TEST 3: Gemini 503 → NVIDIA fallback', {
  env: { GEMINI_API_KEY: 'test-key', NVIDIA_API_KEY: 'test-key' },
  modes: { gemini: '503' },
  expect: { status: 200, provider: 'nvidia', text: 'NVIDIA-ANSWER', nvidiaCalled: true },
});

await runScenario('TEST 4: Gemini timeout → NVIDIA fallback', {
  env: { GEMINI_API_KEY: 'test-key', NVIDIA_API_KEY: 'test-key' },
  modes: { gemini: 'timeout' },
  expect: { status: 200, provider: 'nvidia', text: 'NVIDIA-ANSWER', nvidiaCalled: true },
});

await runScenario('TEST 5: both fail → 503 (deterministic client-side)', {
  env: { GEMINI_API_KEY: 'test-key', NVIDIA_API_KEY: 'test-key' },
  modes: { gemini: '503', nvidia: 'fail' },
  expect: { status: 503 },
});

await runScenario('TEST 6: no keys → 503 (deterministic client-side)', {
  env: {},
  modes: { gemini: 'ok', nvidia: 'ok' },
  expect: { status: 503 },
});

await runScenario('TEST 7: Gemini empty output → NVIDIA fallback', {
  env: { GEMINI_API_KEY: 'test-key', NVIDIA_API_KEY: 'test-key' },
  modes: { gemini: 'empty' },
  expect: { status: 200, provider: 'nvidia', text: 'NVIDIA-ANSWER', nvidiaCalled: true },
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
