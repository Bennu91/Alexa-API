const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIG =================

const HA_URL = 'https://valegabry.duckdns.org';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0ZWYyNDE2NTZiODI0ZTJiYmIwYTU3NDhiNDRiODRjYiIsImlhdCI6MTc3NTU4ODY3MiwiZXhwIjoyMDkwOTQ4NjcyfQ.Bh8qH8Sy9C08KJ5VAdpJ2Q_Mlo1cokkss8ggAq1Jnl4';

// ================= STATO (ANTI-DOPPIE CHIAMATE) =================

let lastTrack = null;
let lastTime = 0;

// ================= BODY =================

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

// ================= FUNZIONI =================

function extractRoomFromStream(url) {
  try {
    const match = url.match(/flow\/[^/]+\/([^/]+)\//i);
    if (match && match[1]) return match[1];
  } catch {}
  return null;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '');
}

function buildAlexaEntity(roomRaw) {
  return `media_player.${normalizeName(roomRaw)}_2`;
}

// 🔥 provider CORRETTO per Alexa
function detectProvider(imageUrl) {
  if (!imageUrl) return "SPOTIFY";

  const url = imageUrl.toLowerCase();

  if (url.includes("apple_music")) return "APPLE_MUSIC";
  if (url.includes("spotify")) return "SPOTIFY";
  if (url.includes("amazon")) return "AMAZON_MUSIC";

  return "SPOTIFY";
}

// 🔥 QUERY PULITA (IMPORTANTISSIMO)
function buildSearchQuery(title, artist, album) {

  if (!title || !artist) return null;

  let query = `Riproduci ${title} di ${artist}`;

  if (album) {
    query += ` dall'album ${album}`;
  }

  return query;
}

// ================= MAIN =================

app.post('/ma/push-url', async (req, res) => {

  let { streamUrl, title, artist, album, imageUrl } = req.body;

  // fallback raw
  if ((!title || !artist) && req.rawBody) {
    try {
      const raw = JSON.parse(req.rawBody);
      title = title || raw.title;
      artist = artist || raw.artist;
      imageUrl = imageUrl || raw.imageUrl;
    } catch {}
  }

  console.log("🎵 DATI:", { title, artist });

  // 🔥 BLOCCO RICHIESTE SENZA METADATA (PRIMA CHIAMATA DI MA)
if (!title || !artist) {
  console.log("⛔ ignorata richiesta senza metadata");
  return res.status(204).end(); // ancora più pulito
}

// 🔥 BLOCCO DUPLICATI (MA spesso manda doppio)
const now = Date.now();
const trackId = `${title}_${artist}`;

if (lastTrack === trackId && (now - lastTime < 3000)) {
  console.log("⛔ duplicato ignorato");
  return res.status(204).end();
}

lastTrack = trackId;
lastTime = now;

  const roomRaw = extractRoomFromStream(streamUrl);
  const alexaDevice = buildAlexaEntity(roomRaw);

  const provider = detectProvider(imageUrl);
  const query = buildSearchQuery(title, artist, album);

  console.log(`➡️ Device: ${alexaDevice}`);
  console.log(`➡️ Provider: ${provider}`);
  console.log(`➡️ Query: ${query}`);

  try {

// 🔥 piccolo delay per evitare errore Alexa
await new Promise(resolve => setTimeout(resolve, 800));

const response = await fetch(`${HA_URL}/api/services/media_player/play_media`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${HA_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    entity_id: alexaDevice,
    media_content_type: provider,
    media_content_id: query
  })
});

    const text = await response.text();

    console.log(`📡 STATUS: ${response.status}`);
    console.log("📡 RISPOSTA:", text);

    res.json({ status: 'ok' });

  } catch (err) {
    console.error("❌ ERRORE:", err.message);
    res.status(500).json({ error: 'HA error' });
  }
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
