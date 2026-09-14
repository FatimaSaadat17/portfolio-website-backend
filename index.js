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
// Music Taste Analyzer — Multi-tier AI Engine (Vercel Serverless)
// ------------------------------------------------------------------
// Tier 1: Local / Tunnel Hermes Docker Agent (OpenAI-compatible)
// Tier 2: Direct Google Gemini API (gemini-flash-lite-latest)
// Tier 3: Built-in Sonic Personality Matrix (zero failure rate)
// ------------------------------------------------------------------

const SYSTEM_MUSIC_PROMPT = `You are the Music Taste Analyzer with a witty, playful, slightly roast-y yet lovable personality (like an observant best friend).
Analyze the 5 submitted songs and return:
1. personalityType: A funny, creative Myers-Briggs style archetype (e.g. "The Unrecovered Emo Elite", "The Performative Aux Dictator", "The 2AM Ceiling Stare Specialist", "The Sonic Overthinker")
2. traits: exactly 4 punchy, humorous, and relatable personality traits (e.g. ["Side-swept bangs in spirit", "Weaponized nostalgia", "Main character energy", "Caffeine-fueled daydreamer"])
3. percentages: an array of 3 to 4 vibe/personality metrics with percentage values totaling 100%. Give them cheeky, specific labels tailored to their exact tracks (e.g. "Performative Melodrama", "Main Character Energy", "Nostalgia Tax", "Aux Anxiety", "Eyeliner Smudge Factor", "A24 Sadness Lifestyle")
4. summary: A 2-4 sentence witty roast/read of their music personality. Call them out directly with loving shade if they put emo tracks ("wow, you are so emo"), performative indie ("oh, you definitely love being performative on the aux"), shoegaze, pop bangers, rap, or classical.
Always respond in VALID JSON ONLY with no markdown fences:
{"personalityType":"...","traits":["...","...","...","..."],"percentages":[{"label":"...","value":45},{"label":"...","value":35},{"label":"...","value":20}],"summary":"..."}`;

function buildMusicPrompt(songs, name) {
  const list = songs.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return name && name.trim()
    ? `Name: ${name.trim()}\nFavorite songs:\n${list}`
    : `Favorite songs:\n${list}`;
}

function parseModelJson(content) {
  if (!content) throw new Error('Empty model response');
  const cleaned = content.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Response is not JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Tier 1: OpenAI-compatible Hermes Agent API
async function callHermesAgentApi({ songs, name }) {
  const apiBase = (process.env.MUSIC_ANALYZER_API_URL || 'http://localhost:8642').replace(/\/+$/, '');
  const apiKey = process.env.MUSIC_ANALYZER_API_KEY || process.env.API_SERVER_KEY || '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: [
          { role: 'system', content: SYSTEM_MUSIC_PROMPT },
          { role: 'user', content: buildMusicPrompt(songs, name) }
        ],
        stream: false
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return parseModelJson(data?.choices?.[0]?.message?.content);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// Tier 2: Direct Google Gemini API (gemini-flash-lite-latest)
async function callGeminiDirectApi({ songs, name }) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Google/Gemini API key configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const promptText = `${SYSTEM_MUSIC_PROMPT}\n\n${buildMusicPrompt(songs, name)}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Gemini status ${res.status}`);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return parseModelJson(rawText);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// Tier 3: Built-in Sonic Personality Matrix (Deterministic Heuristic Engine)
function generateHeuristicPersonality(songs, name) {
  const archetypes = [
    {
      type: 'INFP — The Ethereal Dreamer',
      traits: ['Introspective', 'Poetic', 'Atmospheric', 'Overthinking'],
      percentages: [
        { label: 'Performative Melodrama', value: 45 },
        { label: 'Main Character Energy', value: 35 },
        { label: 'Nostalgia Factor', value: 20 }
      ],
      summary: 'Oh, wow, you definitely love staring out rain-streaked windows pretending you are the tragic protagonist in an indie movie. Your playlist is less about the music and more about auditioning for dramatic cinematic moments.'
    },
    {
      type: 'ENFP — The Performative Aux Dictator',
      traits: ['Eclectic', 'Curious', 'High-Energy', 'Unfiltered'],
      percentages: [
        { label: 'Aux Hijacking Urge', value: 50 },
        { label: 'Chaotic Genre Jumping', value: 30 },
        { label: 'Dopamine Chasing', value: 20 }
      ],
      summary: 'You refuse to let anyone else touch the aux because you have convinced yourself only your curated vibe can save the room. We get it, you are eclectic—now please let a song play past the 90-second mark!'
    },
    {
      type: 'ISFP — The Unrecovered Emo Elite',
      traits: ['Side-swept bangs at heart', 'Weaponized nostalgia', 'Vulnerable', 'Dramatic'],
      percentages: [
        { label: 'Eyeliner Smudge Factor', value: 45 },
        { label: 'Undying 2006 Nostalgia', value: 35 },
        { label: 'Emotional Release', value: 20 }
      ],
      summary: 'Wow, you are so deeply emo! You treat minor inconveniences like an acoustic breakdown and probably still believe marching band drums are a direct attack on your soul.'
    },
    {
      type: 'INTJ — The Pretentious Sound Architect',
      traits: ['Analytical', 'Visionary', 'Polyrhythm fan', 'Headphone snob'],
      percentages: [
        { label: 'Audio Snobbery', value: 40 },
        { label: 'Over-analyzing Mixing', value: 35 },
        { label: 'Earbud Disdain', value: 25 }
      ],
      summary: 'You do not just listen to music—you judge the panning, mixing, and frequency balance. You probably tell people they need lossless FLAC files to truly understand your aesthetic.'
    },
    {
      type: 'INFJ — The 2AM Ceiling Stare Specialist',
      traits: ['Soulful', 'A24 aesthetic', 'Quiet intensity', 'Deep thinker'],
      percentages: [
        { label: 'A24 Sadness Lifestyle', value: 50 },
        { label: 'Late Night Overthinking', value: 30 },
        { label: 'Secret Romantic', value: 20 }
      ],
      summary: 'Oh, so sadness is a full-time aesthetic now? Your music selections are so atmospheric and moody that your houseplants are probably asking for therapy.'
    }
  ];

  const seed = songs.join(' ').toLowerCase().split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const picked = archetypes[seed % archetypes.length];

  const prefix = name ? `For ${name}: ` : '';

  return {
    personalityType: picked.type,
    traits: picked.traits,
    percentages: picked.percentages,
    summary: `${prefix}${picked.summary}`
  };
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

  const cleanName = typeof name === 'string' ? name.slice(0, 60) : '';

  // Attempt 1: Hermes Docker Agent API
  try {
    const analysis = await callHermesAgentApi({ songs: cleanedSongs, name: cleanName });
    if (analysis?.personalityType) {
      return res.json({
        success: true,
        source: 'hermes-agent',
        data: {
          songs: cleanedSongs,
          personalityType: analysis.personalityType,
          traits: Array.isArray(analysis.traits) ? analysis.traits.slice(0, 4) : [],
          percentages: Array.isArray(analysis.percentages) ? analysis.percentages : [],
          summary: analysis.summary || 'Your music taste is uniquely yours.'
        }
      });
    }
  } catch (err1) {
    // Hermes agent offline / unreachable
  }

  // Attempt 2: Direct Google Gemini API
  try {
    const analysis = await callGeminiDirectApi({ songs: cleanedSongs, name: cleanName });
    if (analysis?.personalityType) {
      return res.json({
        success: true,
        source: 'gemini-direct',
        data: {
          songs: cleanedSongs,
          personalityType: analysis.personalityType,
          traits: Array.isArray(analysis.traits) ? analysis.traits.slice(0, 4) : [],
          percentages: Array.isArray(analysis.percentages) ? analysis.percentages : [],
          summary: analysis.summary || 'Your music taste is uniquely yours.'
        }
      });
    }
  } catch (err2) {
    // Direct Gemini key absent or call failed
  }

  // Attempt 3: Built-in Sonic Matrix (zero downtime guarantee)
  const analysis = generateHeuristicPersonality(cleanedSongs, cleanName);
  return res.json({
    success: true,
    source: 'sonic-matrix',
    data: {
      songs: cleanedSongs,
      personalityType: analysis.personalityType,
      traits: analysis.traits,
      percentages: analysis.percentages,
      summary: analysis.summary
    }
  });
});

// ------------------------------------------------------------------
// Vercel serverless export (no app.listen — Vercel invokes the handler)
// ------------------------------------------------------------------
export default app;