// Key-safe AI proxy. API keys never ship to the browser: the client posts to
// /api/ai, the Vite dev proxy forwards here, and this server runs the provider
// manager — Gemini first, NVIDIA NIM (GLM) fallback, deterministic as the
// FINAL fallback handled client-side from the same context data.
//
//   GEMINI_MODEL=gemini-3.8-flash   NVIDIA_MODEL=z-ai/glm-5.3-flash
// (defaults fall back to known-stable model IDs if these are not set)
//
// No express dependency — plain node:http (Node 18+ for global fetch).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local (git-ignored) if present. Real environment variables always
// win — the file only fills in what's missing. Never logged, never returned.
// Skipped entirely under the mock failover harness (HF_SKIP_ENV_FILE=1) so
// "no keys configured" is actually testable.
try {
  if (process.env.HF_SKIP_ENV_FILE !== '1') {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        const value = m?.[2]?.replace(/^['"]|['"]$/g, '');
        // Skip empties and untouched template placeholders — a placeholder must
        // not be mistaken for a configured credential.
        if (m && value && !/^your-|^your_|_here$/i.test(value) && process.env[m[1]] === undefined) {
          process.env[m[1]] = value;
        }
      }
    }
  }
} catch {
  // env file is optional
}

const PORT = Number(process.env.PORT) || 8787;

// Model names stay configurable — never scattered through components.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? 'z-ai/glm-4.6';
// OpenAI-compatible endpoint, overridable for testing/self-hosting.
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
// GLM-5.3 is a reasoning model: without this flag it can spend the whole token
// budget in reasoning_content and return content:null. Verified live.
const NVIDIA_DISABLE_THINKING = process.env.NVIDIA_DISABLE_THINKING !== '0';
// Gemini endpoint likewise overridable (used by the dev failover test harness).
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
// Gemini 3 thinking models burn 20-45s on internal reasoning before answering.
// 0 disables thinking entirely (fast); -1 lets the model decide. Configurable
// so switching GEMINI_MODEL doesn't require a code change.
const GEMINI_THINKING_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? 0);

// Per-provider timeout. NVIDIA NIM cold-starts are slow (~35-45s observed live
// on GLM-5.3-flash), so the fallback gets a longer window than Gemini; the
// failover chain only pays this cost when Gemini is already down.
const GEMINI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 20_000);
const NVIDIA_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS ?? 60_000);

const SYSTEM_INSTRUCTIONS = `You are HealthFlow, a healthcare supply-chain analyst for a simulated PHC network (demo data).
You receive pre-computed facts from a deterministic calculation engine.
Rules:
- Use ONLY the numbers provided in the context. Never invent, estimate, or compute new figures.
- Write concise, professional, decision-support prose for health officials.
- Structure output as short sections: Situation, Affected Districts, Risk Drivers, Recommended Interventions.
- Weights and thresholds in the context are labeled prototype assumptions — refer to them as such.
- This is SIMULATED NETWORK / DEMO DATA; do not present it as real government data.`;

// ── Provider interface ────────────────────────────────────────────────────────
// generate({ question, contextData, task }) -> { text, provider, model }
// Throws on failure; the manager decides fallback. HTTP status on the error
// marks retryable (availability) vs non-retryable (request bug) failures.

function retryableStatus(status) {
  return (
    status === 429 || status === 500 || status === 502 || status === 503 ||
    status === 504 || status === undefined // network/timeout/abort → assume transient
  );
}

function providerError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function fetchWithTimeout(url, options, timeoutMs = GEMINI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Gemini provider ───────────────────────────────────────────────────────────

async function callGemini({ question, contextData, task }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw providerError('GEMINI_API_KEY not configured', 503);

  const instruction =
    task === 'brief'
      ? 'Write the executive policy brief now, using only the context below.'
      : `Answer the question using only the context below.\n\nQuestion: ${question}`;

  const userText = `${instruction}\n\n--- CONTEXT (pre-computed, deterministic) ---\n${contextData}\n--- END CONTEXT ---`;

  try {
    const res = await fetchWithTimeout(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1400,
            ...(GEMINI_THINKING_BUDGET >= 0
              ? { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET } }
              : {}),
          },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw providerError(`Gemini responded ${res.status}: ${detail.slice(0, 200)}`, res.status);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    // Thinking models emit thought-summary parts alongside the answer — keep
    // only the real content.
    const text = parts
      .filter((p) => p.thought !== true)
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!text) throw providerError('Gemini returned no text', 502);
    return { text, provider: 'gemini', model: GEMINI_MODEL };
  } catch (err) {
    if (err.name === 'AbortError') throw providerError('Gemini timeout', undefined);
    throw err;
  }
}

// ── NVIDIA provider (OpenAI-compatible chat completions) ──────────────────────

async function callNvidia({ question, contextData, task }) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw providerError('NVIDIA_API_KEY not configured', 503);

  const instruction =
    task === 'brief'
      ? 'Write the executive policy brief now, using only the context below.'
      : `Answer the question using only the context below.\n\nQuestion: ${question}`;

  const userText = `${instruction}\n\n--- CONTEXT (pre-computed, deterministic) ---\n${contextData}\n--- END CONTEXT ---`;

  try {
    const res = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTIONS },
            { role: 'user', content: userText },
          ],
          temperature: 0.4,
          max_tokens: 1400,
          ...(NVIDIA_DISABLE_THINKING ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
      },
      NVIDIA_TIMEOUT_MS,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw providerError(`NVIDIA responded ${res.status}: ${detail.slice(0, 200)}`, res.status);
    }
    const data = await res.json();
    const text = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw providerError('NVIDIA returned no text', 502);
    return { text, provider: 'nvidia', model: NVIDIA_MODEL };
  } catch (err) {
    if (err.name === 'AbortError') throw providerError('NVIDIA timeout', undefined);
    throw err;
  }
}

// ── Provider manager: Gemini → NVIDIA → (deterministic lives client-side) ────

async function generate(request) {
  const providers = [
    { name: 'gemini', call: callGemini },
    { name: 'nvidia', call: callNvidia },
  ];
  let lastError = null;
  for (const p of providers) {
    // One attempt per provider, plus ONE short retry on retryable failures —
    // Gemini 3 currently 503-flaps under load (~50% of requests), and a single
    // quick retry recovers most of those without dragging the UI.
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const result = await p.call(request);
        logProvider(p.name, attempt > 0 ? `success(retry ${attempt})` : 'success', Date.now() - t0);
        return result; // first success wins — no further providers contacted
      } catch (err) {
        lastError = err;
        logProvider(p.name, 'failed', Date.now() - t0, err?.status);
        if (!retryableStatus(err?.status)) break; // config bug → next provider
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  throw lastError ?? providerError('no provider available', 503);
}

// Internal debug log — provider/model/status/latency only. Never secrets,
// never user content.
function logProvider(provider, status, latencyMs, code) {
  const line = `provider=${provider} status=${status}${code ? ` code=${code}` : ''} latency=${latencyMs}ms`;
  if (status === 'failed') console.error(`[ai-manager] ${line}`);
  else console.log(`[ai-manager] ${line}`);
}

// ── HTTP surface ──────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 200_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        nvidiaConfigured: Boolean(process.env.NVIDIA_API_KEY),
      }),
    );
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ai') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.contextData || typeof body.contextData !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'contextData is required' }));
        return;
      }
      try {
        const result = await generate({
          question: String(body.question ?? '').slice(0, 500),
          contextData: body.contextData.slice(0, 100_000),
          task: body.task === 'brief' ? 'brief' : 'explain',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result)); // { text, provider, model }
      } catch (err) {
        // Both providers failed — the CLIENT renders deterministic fallback
        // from the same context data. Never leak raw upstream errors.
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'AI providers unavailable' }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad request' }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[ai-proxy] listening on http://localhost:${PORT}`);
  console.log(
    `[ai-proxy] gemini=${process.env.GEMINI_API_KEY ? 'configured' : 'missing'} (model: ${GEMINI_MODEL}) · nvidia=${process.env.NVIDIA_API_KEY ? 'configured' : 'missing'} (model: ${NVIDIA_MODEL})`,
  );
});
