const express = require('express');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// ================= CONFIG HOME ASSISTANT =================

const HA_URL = 'https://valegabry.duckdns.org';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI2ZWNlNjZhMDBjZmI0MTEwODVmYzNlN2M2Zjc2NThhNCIsImlhdCI6MTc3NTU3MTgyMSwiZXhwIjoyMDkwOTMxODIxfQ.mGSOL4OkyKngE_-vqihg4OhAb12M-sa6C9j3PHPqduU'; // 🔥 RIMETTILO

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

// 🔥 Estrae stanza
function extractRoomFromStream(url) {
  try {
    const match = url.match(/flow\/[^/]+\/([^/]+)\//i);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {}

  return "soggiorno";
}

// 🔥 NORMALIZZA (QUESTO RISOLVE IL TUO PROBLEMA)
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')     // spazi → _
    .replace(/[^\w_]/g, '');  // rimuove caratteri strani
}

// 🔥 Costruisce entity Alexa
function buildAlexaEntity(roomRaw) {
  const room = normalizeName(roomRaw);
  return `media_player.${room}_2`;
}

// 🔥 Provider
function detectProvider(imageUrl) {
  if (!imageUrl) return "Spotify";

  const url = imageUrl.toLowerCase();

  if (url.includes("apple_music")) return "Apple Music";
  if (url.includes("spotify")) return "Spotify";
  if (url.includes("amazon")) return "Amazon Music";

  return "Spotify";
}

// 🔥 Comando Alexa
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

// ================= STREAM + PLAY =================

app.post('/ma/push-url', async (req, res) => {

  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    console.log("❌ STREAM NON VALIDO");
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  obj = { streamUrl, title, artist, album, imageUrl };

  console.log("🎵 STREAM SALVATO:", obj);

  // 🔥 ESTRAZIONE + NORMALIZZAZIONE
  const roomRaw = extractRoomFromStream(streamUrl);
  const alexaDevice = buildAlexaEntity(roomRaw);

  const command = buildAlexaCommand(title, artist, imageUrl);

  console.log(`➡️ Stanza RAW: ${roomRaw}`);
  console.log(`➡️ Device Alexa: ${alexaDevice}`);
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

    const text = await response.text();

    console.log(`📡 STATUS HA: ${response.status}`);
    console.log("📡 RISPOSTA HA:", text);

    res.json({ status: 'ok', ha_status: response.status });

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

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
