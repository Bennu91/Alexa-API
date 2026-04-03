const express = require('express');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// ================= LOGGER =================

function logRequest(req) {
  console.log("=======================================");
  console.log("TIME:", new Date().toISOString());
  console.log("METHOD:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("HEADERS:", JSON.stringify(req.headers, null, 2));
  console.log("QUERY:", JSON.stringify(req.query, null, 2));
  console.log("BODY:", req.rawBody || req.body);
  console.log("=======================================\n");
}

// Middleware per salvare raw body
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ================= VAR =================

let obj = null;
let lastIntent = null;
let intentHistory = [];

// ================= AUTH SOLO STREAM =================

if (USERNAME && PASSWORD) {
  app.use('/ma/latest-url', (req, res, next) => {
    const credentials = auth(req);

    if (!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
      res.set('WWW-Authenticate', 'Basic realm="music-assistant-alexa-api"');
      return res.status(401).send('Access denied');
    }

    next();
  });
}

// ================= INTENTS DEBUG =================

// 🔥 intercetta QUALSIASI chiamata
app.all(['/alexa/intents', '/alexa/intents/'], (req, res, next) => {
  logRequest(req);
  next();
});

// POST vero
app.post(['/alexa/intents', '/alexa/intents/'], (req, res) => {
  let intent = null;
  let slots = {};

  // supporta vari formati
  if (req.body && typeof req.body === 'object') {
    intent = req.body.intent || req.body.name || null;
    slots = req.body.slots || {};
  }

  // fallback GET-style
  if (!intent && req.query.intent) {
    intent = req.query.intent;
    try {
      slots = req.query.slots ? JSON.parse(req.query.slots) : {};
    } catch {
      slots = {};
    }
  }

  if (!intent) {
    console.log("⚠️ INTENT NON TROVATO");
    return res.status(400).json({ error: 'Missing intent' });
  }

  lastIntent = { intent, slots, time: Date.now() };
  intentHistory.push(lastIntent);

  // tieni solo ultimi 20
  if (intentHistory.length > 20) intentHistory.shift();

  console.log("✅ INTENT SALVATO:", lastIntent);

  res.json({ status: 'ok' });
});

// GET fallback (Music Assistant rompe le regole 😅)
app.get(['/alexa/intents', '/alexa/intents/'], (req, res) => {
  logRequest(req);

  const intent = req.query.intent;

  if (!intent) {
    return res.status(400).json({ error: 'Missing intent' });
  }

  let slots = {};
  try {
    slots = req.query.slots ? JSON.parse(req.query.slots) : {};
  } catch {}

  lastIntent = { intent, slots, time: Date.now() };
  intentHistory.push(lastIntent);

  if (intentHistory.length > 20) intentHistory.shift();

  console.log("✅ INTENT (GET) SALVATO:", lastIntent);

  res.json({ status: 'ok' });
});

// endpoint debug
app.get('/alexa/latest-intent', (req, res) => {
  res.json(lastIntent || {});
});

// storico
app.get('/alexa/intents/history', (req, res) => {
  res.json(intentHistory);
});

// ================= STREAM =================

app.post('/ma/push-url', (req, res) => {
  logRequest(req);

  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  obj = { streamUrl, title, artist, album, imageUrl };

  console.log("🎵 STREAM AGGIORNATO:", obj);

  res.json({ status: 'ok' });
});

app.get('/ma/latest-url', (req, res) => {
  if (!obj) {
    return res.status(404).json({ error: 'No URL available' });
  }

  res.json(obj);
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 MA-Alexa API running on port ${PORT}`);
});
