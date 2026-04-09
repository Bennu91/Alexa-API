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
  console.log("BODY:\n", JSON.stringify(req.body, null, 2));
  console.log("===========================================\n");
}

app.use((req, res, next) => {
  logRequest(req);
  next();
});

// ================= VAR =================

let obj = null;
let lastUpdate = null;

// ================= AUTH =================

if (USERNAME && PASSWORD) {
  app.use('/ma', (req, res, next) => {
    const credentials = auth(req);

    if (!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
      res.set('WWW-Authenticate', 'Basic realm="music-assistant-alexa-api"');
      return res.status(401).send('Access denied');
    }

    next();
  });
}

// ================= STREAM =================

app.post('/ma/push-url', (req, res) => {

  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    console.log("❌ STREAM NON VALIDO");
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  obj = { streamUrl, title, artist, album, imageUrl };
  lastUpdate = Date.now();

  console.log("🎵 STREAM AGGIORNATO:", title);

  res.json({ status: 'ok' });
});

// 🔥 invariato (fondamentale per Alexa)
app.get('/ma/latest-url', (req, res) => {
  if (!obj) {
    return res.status(404).json({ error: 'No URL available' });
  }

  res.json(obj);
});

// ================= DEBUG (NUOVO ma innocuo) =================

app.get('/ma/debug', (req, res) => {
  res.json({
    hasStream: !!obj,
    lastUpdate,
    track: obj || null
  });
});

// ================= CATCH ALL =================

app.use((req, res) => {
  console.log("⚠️ ROUTE NON GESTITA:", req.method, req.originalUrl);
  res.status(404).json({ error: 'Not found but logged' });
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
