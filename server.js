const express = require('express');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// ================= CONFIG HOME ASSISTANT =================

const HA_URL = 'https://valegabry.duckdns.org';
const HA_TOKEN = 'METTI_IL_TUO_TOKEN_CORRETTO';

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
  console.log("BODY:\n", JSON.stringify(req.body, null, 2));
  console.log("===========================================\n");
}

app.use((req, res, next) => {
  logRequest(req);
  next();
});

// ================= VAR =================

let obj = null;

// ================= FUNZIONI =================

function extractRoomFromStream(url) {
  try {
    const match = url.match(/flow\/[^/]+\/([^/]+)\//i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  } catch (e) {}

  return "soggiorno";
}

function buildAlexaEntity(room) {
  return `media_player.${room}_2`;
}

function detectProvider(imageUrl) {
  if (!imageUrl) return "Spotify";

  const url = imageUrl.toLowerCase();

  if (url.includes("apple_music")) return "Apple Music";
  if (url.includes("spotify")) return "Spotify";
  if (url.includes("amazon")) return "Amazon Music";

  return "Spotify";
}

function buildAlexaCommand(title, artist, imageUrl) {
  const provider = detectProvider(imageUrl);

  if (title && artist) {
    return `riproduci ${title} di ${artist} su ${provider}`;
  }

  if (title) {
    return `riproduci ${title} su ${provider}`;
  }

  return null;
}

// ================= AUTH =================

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

// ================= STREAM + PLAY =================

app.post('/ma/push-url', async (req, res) => {

  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    console.log("❌ STREAM NON VALIDO");
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  obj = { streamUrl, title, artist, album, imageUrl };

  console.log("🎵 STREAM SALVATO:", obj);

  const room = extractRoomFromStream(streamUrl);
  const alexaDevice = buildAlexaEntity(room);
  const command = buildAlexaCommand(title, artist, imageUrl);

  console.log(`➡️ Stanza: ${room}`);
  console.log(`➡️ Device: ${alexaDevice}`);
  console.log(`➡️ Comando: ${command}`);

  if (!command) {
    return res.status(400).json({ error: 'Cannot build command' });
  }

  try {

    const response = await fetch(`${HA_URL}/api/services/media_player/play_media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entity_id: alexaDevice,
        media_content_type: "custom",
        media_content_id: `Alexa, ${command}`
      })
    });

    const data = await response.text();

    console.log("✅ RISPOSTA HA:", data);

    res.json({ status: 'ok' });

  } catch (err) {
    console.error("❌ ERRORE:", err.message);
    res.status(500).json({ error: 'Home Assistant error' });
  }
});

// ================= DEBUG =================

app.get('/ma/latest-url', (req, res) => {
  if (!obj) {
    return res.status(404).json({ error: 'No URL available' });
  }
  res.json(obj);
});

// ================= CATCH ALL =================

app.use((req, res) => {
  console.log("⚠️ ROUTE NON GESTITA:", req.method, req.originalUrl);
  res.status(404).json({ error: 'Not found' });
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
