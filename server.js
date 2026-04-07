const express = require('express');
const auth = require('basic-auth');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// ================= CONFIG HOME ASSISTANT =================

const HA_URL = 'https://valegabry.duckdns.org';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwNzQ0ZTdkNGM1YTc0NDA0OTgxYzY2YTkwMTRmM2I1MSIsImlhdCI6MTc3NTU3MDUwNy,"exp":2090930507}.lz3AYTwCGQ6BTfQaK-8lDRpBjf-YKWss-Sr-oFsph0Y';

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
  console.log("BODY PARSED:\n", JSON.stringify(req.body, null, 2));
  console.log("BODY RAW:\n", req.rawBody);
  console.log("===========================================\n");
}

app.use((req, res, next) => {
  logRequest(req);
  next();
});

// ================= VAR =================

let obj = null;

// ================= FUNZIONI =================

// Estrae stanza da streamUrl
function extractRoomFromStream(url) {
  try {
    const match = url.match(/flow\/[^/]+\/([^/]+)\//i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  } catch (e) {}

  return "soggiorno";
}

// Costruisce entity Alexa
function buildAlexaEntity(room) {
  return `media_player.${room}_2`;
}

// Rileva provider da imageUrl
function detectProvider(imageUrl) {
  if (!imageUrl) return "Spotify";

  const url = imageUrl.toLowerCase();

  if (url.includes("apple_music")) return "Apple Music";
  if (url.includes("spotify")) return "Spotify";
  if (url.includes("amazon")) return "Amazon Music";

  return "Spotify";
}

// Costruisce comando Alexa
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

// ================= STREAM + PLAY ALEXA =================

app.post('/ma/push-url', async (req, res) => {

  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    console.log("❌ STREAM NON VALIDO");
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  obj = { streamUrl, title, artist, album, imageUrl };

  console.log("🎵 STREAM SALVATO:", obj);

  // Estrazione stanza
  const room = extractRoomFromStream(streamUrl);
  const alexaDevice = buildAlexaEntity(room);

  // Costruzione comando
  const command = buildAlexaCommand(title, artist, imageUrl);

  console.log(`➡️ Stanza: ${room}`);
  console.log(`➡️ Device Alexa: ${alexaDevice}`);
  console.log(`➡️ Comando: ${command}`);

  if (!command) {
    return res.status(400).json({ error: 'Cannot build command' });
  }

  try {

    await axios.post(
      `${HA_URL}/api/services/media_player/play_media`,
      {
        entity_id: alexaDevice,
        media_content_type: "custom",
        media_content_id: `Alexa, ${command}`
      },
      {
        headers: {
          Authorization: `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ PLAY INVIATO AD ALEXA");

    res.json({ status: 'ok' });

  } catch (err) {
    console.error("❌ ERRORE HOME ASSISTANT:", err.response?.data || err.message);
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
  res.status(404).json({ error: 'Not found but logged' });
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
