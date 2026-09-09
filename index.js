import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'greetings.json');

const app = express();
const PORT = process.env.PORT || 5001;

// CORS - UPDATE THE ORIGINS BELOW WITH YOUR ACTUAL VERCEL URL
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  // >>> REPLACE THIS WITH YOUR ACTUAL VERCEL URL <<<
  'https://personal-website-fatima-ali.vercel.app',
  // Add custom domain later if needed:
  // 'https://your-custom-domain.com'
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Helper: load greetings
function loadGreetings() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = [
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
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading greetings data:', err);
    return [];
  }
}

// Helper: save greetings
function saveGreetings(greetings) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(greetings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving greetings data:', err);
    return false;
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Floppy Disk Portfolio Greetings API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/greetings', (req, res) => {
  const greetings = loadGreetings();
  res.json({
    success: true,
    count: greetings.length,
    data: greetings
  });
});

app.post('/api/greetings', (req, res) => {
  const { name, email, message, stamp } = req.body;

  if (!name || !message) {
    return res.status(400).json({
      success: false,
      error: 'Name and message are required fields.'
    });
  }

  const greetings = loadGreetings();
  const newGreeting = {
    id: 'g-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    name: name.trim().slice(0, 80),
    email: (email || '').trim().slice(0, 100),
    message: message.trim().slice(0, 1000),
    stamp: stamp || '💌',
    timestamp: new Date().toISOString()
  };

  greetings.unshift(newGreeting);
  saveGreetings(greetings);

  res.status(201).json({
    success: true,
    message: 'Greeting received and saved to floppy disk sector!',
    data: newGreeting
  });
});

app.delete('/api/greetings/:id', (req, res) => {
  const { id } = req.params;
  let greetings = loadGreetings();
  const initialLength = greetings.length;
  greetings = greetings.filter(g => g.id !== id);

  if (greetings.length === initialLength) {
    return res.status(404).json({ success: false, error: 'Greeting not found.' });
  }

  saveGreetings(greetings);
  res.json({ success: true, message: 'Greeting removed successfully.' });
});

app.listen(PORT, () => {
  console.log(`[Floppy Disk Backend] Server listening on http://localhost:${PORT}`);
});