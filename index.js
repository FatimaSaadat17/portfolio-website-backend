import express from 'express';
import cors from 'cors';

const app = express();

// CORS - origins allowed to call this API
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  // >>> ADD ANY OTHER DEPLOYED FRONTEND URLS HERE <<<
  'https://personal-website-fatima-ali.vercel.app',
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ------------------------------------------------------------------
// Persistence: Upstash KV (REST API) — durable across Vercel's
// stateless serverless functions.
//
// Required env vars (set in Vercel project / .env for local dev):
//   UPSTASH_REDIS_REST_URL   e.g. https://xxxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN e.g. AYbXxxxx
//
// Fallback: if env vars are missing, we serve from an in-memory seed
// (single deployment). Prefer Upstash so greetings persist.
// ------------------------------------------------------------------
const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const KV_KEY = 'floppy_disk_greetings_v1';

const SEED_GREETINGS = [
  {
    id: 'g-1',
    name: 'Finn the Human',
    email: 'finn@treefort.local',
    message: 'Mathematical! Love the floppy disk design, Fatima!',
    stamp: '⭐',
    timestamp: new Date().toISOString()
  },
  {
    id: 'g-2',
    name: 'Marceline',
    email: 'marcy@cave.net',
    message: 'Pretty cool aesthetic. The ASCII portrait rocks.',
    stamp: '🎸',
    timestamp: new Date().toISOString()
  }
];

async function kvRequest(method, path = '', rawBody = null) {
  const res = await fetch(`${KV_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    // Upstash REST expects the raw value as the request body (no extra JSON.stringify)
    body: rawBody
  });
  if (!res.ok) {
    throw new Error(`Upstash error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function loadGreetings() {
  if (!KV_URL || !KV_TOKEN) {
    // No KV configured — serve seed data (non-persistent)
    return SEED_GREETINGS;
  }
  // Upstash REST: GET /get/<key> -> { result: "<json string>" | null }
  const data = await kvRequest('GET', `/get/${KV_KEY}`);
  let parsed = null;
  try {
    parsed = data.result ? JSON.parse(data.result) : null;
  } catch (e) {
    parsed = null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    // First run: seed the key via POST /set/<key> with body value
    await kvRequest('POST', `/set/${KV_KEY}`, JSON.stringify(SEED_GREETINGS));
    return SEED_GREETINGS;
  }
  return parsed;
}

async function saveGreetings(greetings) {
  if (!KV_URL || !KV_TOKEN) return false;
  // Upstash REST: POST /set/<key> with body value (returns { result: "OK" })
  await kvRequest('POST', `/set/${KV_KEY}`, JSON.stringify(greetings));
  return true;
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Floppy Disk Portfolio Greetings API',
    message: 'Backend is running. Use /api/health for detailed health check.',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Floppy Disk Portfolio Greetings API',
    storage: (KV_URL && KV_TOKEN) ? 'upstash-kv' : 'in-memory (no Upstash env vars set)',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/greetings', async (req, res) => {
  try {
    const greetings = await loadGreetings();
    res.json({ success: true, count: greetings.length, data: greetings });
  } catch (err) {
    console.error('GET /api/greetings error:', err);
    res.status(500).json({ success: false, error: 'Could not load greetings.' });
  }
});

app.post('/api/greetings', async (req, res) => {
  const { name, email, message, stamp } = req.body;

  if (!name || !message) {
    return res.status(400).json({
      success: false,
      error: 'Name and message are required fields.'
    });
  }

  const newGreeting = {
    id: 'g-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    name: name.trim().slice(0, 80),
    email: (email || '').trim().slice(0, 100),
    message: message.trim().slice(0, 1000),
    stamp: stamp || '💌',
    timestamp: new Date().toISOString()
  };

  try {
    const greetings = await loadGreetings();
    greetings.unshift(newGreeting);
    await saveGreetings(greetings);

    res.status(201).json({
      success: true,
      message: 'Greeting received and saved to floppy disk sector!',
      data: newGreeting
    });
  } catch (err) {
    console.error('POST /api/greetings error:', err);
    res.status(500).json({ success: false, error: 'Could not save greeting.' });
  }
});

app.delete('/api/greetings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const greetings = await loadGreetings();
    const initialLength = greetings.length;
    const filtered = greetings.filter(g => g.id !== id);

    if (filtered.length === initialLength) {
      return res.status(404).json({ success: false, error: 'Greeting not found.' });
    }

    await saveGreetings(filtered);
    res.json({ success: true, message: 'Greeting removed successfully.' });
  } catch (err) {
    console.error('DELETE /api/greetings/:id error:', err);
    res.status(500).json({ success: false, error: 'Could not delete greeting.' });
  }
});

// ------------------------------------------------------------------
// Music Taste Analyzer — AI backend route (Vercel serverless)
// ------------------------------------------------------------------
// This route calls the Hermes Agent Docker container's OpenAI-compatible
// API server (http://localhost:8642/v1/chat/completions) with a curated
// prompt that turns 5 songs into a personality type + traits + summary.
//
// Where does the request point? Injected from env at request time:
//   MUSIC_ANALYZER_API_URL      OpenAI-compatible API server base (optional)
//   MUSIC_ANALYZER_API_KEY      bearer key for that server (optional)
// If unset locally, we default to the local Docker container
// (http://localhost:8642) using the API_SERVER_KEY from the host .env
// (visible to the local server, NOT to Vercel).
//
// On Vercel, the container does not run — set these two env vars in the
// Vercel project to wherever your Hermes Docker container's API server is
// reachable (e.g. a tunnel URL), or the route returns a clear offline
// message. The frontend falls back gracefully either way.
// ------------------------------------------------------------------
async function callMusicAnalyzerApi({ songs, name }) {
  const apiBase = (process.env.MUSIC_ANALYZER_API_URL || 'http://localhost:8642').replace(/\/+$/, '');
  // Local: reuse API_SERVER_KEY from host .env / Vercel env
  const apiKey = process.env.MUSIC_ANALYZER_API_KEY
    || process.env.API_SERVER_KEY
    || '';

  const systemPrompt = `You are the Music Taste Analyzer, a fun, personality-insight engine for a portfolio website.
The user submits 5 of their favorite songs. Analyze the musical fingerprint (genre, mood, energy, lyrics themes, era, artist style) and return:
1. personalityType: a creative Myers-Briggs-inspired label, e.g. "ENFP — The Sonic Dreamer"
2. traits: an array of exactly 4 short, punchy personality trait labels (e.g. "Curious", "Nostalgic")
3. summary: 2-3 sentences describing what their taste says about them, warm and encouraging.
Always respond with VALID JSON ONLY, no markdown fences, no commentary, in this exact shape:
{"personalityType":"...","traits":["...","...","...","..."],"summary":"..."}`;

  const userPrompt = name && name.trim()
    ? `Name: ${name.trim()}\nFavorite songs:\n${songs.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : `Favorite songs:\n${songs.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

  const res = await fetch(`${apiBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model: 'hermes-agent',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: false
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI backend responded ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('AI backend returned an empty response.');

  // Parse the JSON the model returns (strip any accidental fences)
  const cleaned = content.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI response was not valid JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

app.post('/api/music-analyze', async (req, res) => {
  const { songs, name } = req.body || {};

  if (!Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Please provide at least one song.'
    });
  }

  const cleanedSongs = songs
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);

  if (cleanedSongs.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Please enter at least one song title.'
    });
  }

  try {
    const analysis = await callMusicAnalyzerApi({
      songs: cleanedSongs,
      name: typeof name === 'string' ? name.slice(0, 60) : ''
    });

    res.json({
      success: true,
      data: {
        songs: cleanedSongs,
        personalityType: analysis.personalityType || 'The Unknown Groove',
        traits: Array.isArray(analysis.traits) ? analysis.traits.slice(0, 4) : [],
        summary: analysis.summary || 'Your music taste is uniquely yours — keep exploring!'
      }
    });
  } catch (err) {
    console.error('POST /api/music-analyze error:', err.message || err);
    res.status(502).json({
      success: false,
      error: 'The music analysis engine is offline right now. Check back soon!',
      detail: process.env.NODE_ENV === 'development' ? (err.message || String(err)) : undefined
    });
  }
});

// ------------------------------------------------------------------
// Vercel serverless export (no app.listen — Vercel invokes the handler)
// ------------------------------------------------------------------
export default app;