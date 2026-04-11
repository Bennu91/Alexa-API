const express = require('express');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// ================= RAW BODY =================

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ================= LOGGER =================

function logRequest(req) {
  console.log("\n================= REQUEST =================");
  console.log("TIME:", new Date().toISOString());
  console.log("IP:", req.ip);
  console.log("METHOD:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("HEADERS:\n", JSON.stringify(req.headers, null, 2));
  console.log("QUERY:\n", JSON.stringify(req.query, null, 2));
  console.log("BODY PARSED:\n", JSON.stringify(req.body, null, 2));
  console.log("BODY RAW:\n", req.rawBody);
  console.log("===========================================\n");
}

app.use((req, res, next) => {
  logRequest(req);
  next();
});

function extractDirectImageUrl(proxyUrl) {
  try {
    if (!proxyUrl) return null;

    const url = new URL(proxyUrl);
    let path = url.searchParams.get('path');

    if (!path) return null;

    for (let i = 0; i < 5; i++) {
      try {
        path = decodeURIComponent(path);
      } catch (e) {
        break;
      }

      if (path.startsWith('http')) break;
    }

    if (!path.startsWith('http')) return null;

    // riduzione dimensione Apple
    path = path.replace(/\/1000x1000bb\.jpg$/, '/500x500bb.jpg');

    return path;

  } catch (e) {
    console.log("IMAGE FIX ERROR:", e);
    return null;
  }
}

// ================= VAR =================

let obj = null;
let prevObj = null; // 🔥 NUOVO

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

// ================= INTENTS =================

app.all(['/alexa/intents', '/alexa/intents/'], (req, res) => {

  let intent = null;
  let slots = {};

  if (req.body && typeof req.body === 'object') {
    intent = req.body.intent || req.body.name || null;
    slots = req.body.slots || {};
  }

  if (!intent && req.query.intent) {
    intent = req.query.intent;

    try {
      slots = req.query.slots ? JSON.parse(req.query.slots) : {};
    } catch {
      slots = {};
    }
  }

  if (!intent) {
    console.log("⚠️ NESSUN INTENT TROVATO");
    return res.status(200).json({ status: 'no_intent_but_logged' });
  }

  lastIntent = {
    intent,
    slots,
    time: new Date().toISOString(),
    method: req.method
  };

  intentHistory.push(lastIntent);
  if (intentHistory.length > 50) intentHistory.shift();

  console.log("✅ INTENT RICEVUTO:", lastIntent);

  res.json({ status: 'ok' });
});

// ================= DEBUG =================

app.get('/alexa/latest-intent', (req, res) => {
  res.json(lastIntent || {});
});

app.get('/alexa/intents/history', (req, res) => {
  res.json(intentHistory);
});

// ================= STREAM =================

app.post('/ma/push-url', (req, res) => {

  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    console.log("❌ STREAM NON VALIDO");
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  // 🔥 salva precedente
  prevObj = obj;

  const fixedImage = extractDirectImageUrl(imageUrl);
  
  obj = {
    streamUrl,
    title,
    artist,
    album,
    imageUrl: fixedImage || imageUrl
  };

  console.log("🎵 STREAM SALVATO:", obj);

  res.json({ status: 'ok' });
});

app.get('/ma/latest-url', (req, res) => {
  if (!obj) {
    return res.status(404).json({ error: 'No URL available' });
  }

  res.json(obj);
});

// 🔥 NUOVO NEXT (usa ultimo stream ricevuto)
app.get('/ma/next', (req, res) => {
  if (!obj) {
    return res.status(404).json({ error: 'No next track' });
  }
  res.json(obj);
});

// 🔥 NUOVO PREVIOUS
app.get('/ma/previous', (req, res) => {
  if (!prevObj) {
    return res.status(404).json({ error: 'No previous track' });
  }
  res.json(prevObj);
});

// ================= CATCH ALL =================

app.use((req, res) => {
  console.log("⚠️ ROUTE NON GESTITA:", req.method, req.originalUrl);
  res.status(404).json({ error: 'Not found but logged' });
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 DEBUG API attiva sulla porta ${PORT}`);
});
