const express = require('express');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIG =================

const HA_URL = 'https://valegabry.duckdns.org';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0ZWYyNDE2NTZiODI0ZTJiYmIwYTU3NDhiNDRiODRjYiIsImlhdCI6MTc3NTU4ODY3MiwiZXhwIjoyMDkwOTQ4NjcyfQ.Bh8qH8Sy9C08KJ5VAdpJ2Q_Mlo1cokkss8ggAq1Jnl4';

// ================= RAW BODY =================

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// 🔥 QUESTO ERA IL PROBLEMA
app.use(express.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ================= LOGGER =================

app.use((req, res, next) => {
  console.log("\n================= REQUEST =================");
  console.log("TIME:", new Date().toISOString());
  console.log("BODY PARSED:\n", JSON.stringify(req.body, null, 2));
  console.log("BODY RAW:\n", req.rawBody);
  console.log("===========================================\n");
  next();
});

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
  const room = normalizeName(roomRaw);
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

// 🔥 FIX IMPORTANTE: prova anche RAW BODY
function extractMetadata(req) {

  let { title, artist, album, imageUrl } = req.body || {};

  // fallback su raw JSON se parsing fallisce
  if ((!title || !artist) && req.rawBody) {
    try {
      const raw = JSON.parse(req.rawBody);
      title = title || raw.title;
      artist = artist || raw.artist;
      album = album || raw.album;
      imageUrl = imageUrl || raw.imageUrl;
    } catch {}
  }

  return { title, artist, album, imageUrl };
}

function buildAlexaCommand(title, artist, imageUrl) {

  if (!title || !artist) {
    console.log("❌ METADATA MANCANTI → NON INVIO NULLA");
    return null;
  }

  const provider = detectProvider(imageUrl);

  return `riproduci ${title} di ${artist} su ${provider}`;
}

// ================= MAIN =================

app.post('/ma/push-url', async (req, res) => {

  const { streamUrl } = req.body;

  if (!streamUrl) {
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  // 🔥 estrai metadata in modo robusto
  const { title, artist, album, imageUrl } = extractMetadata(req);

  console.log("🎵 METADATA:", { title, artist, album });

  // 🔥 se manca metadata → STOP (no musica random)
  if (!title || !artist) {
    console.log("⛔ BLOCCATO: metadata incompleti");
    return res.json({ status: 'ignored_no_metadata' });
  }

  const roomRaw = extractRoomFromStream(streamUrl);

  if (!roomRaw) {
    console.log("❌ impossibile estrarre stanza");
    return res.status(400).json({ error: 'No room' });
  }

  const alexaDevice = buildAlexaEntity(roomRaw);
  const command = buildAlexaCommand(title, artist, imageUrl);

  console.log(`➡️ Device: ${alexaDevice}`);
  console.log(`➡️ Comando: ${command}`);

  try {

    const response = await fetch(`${HA_URL}/api/services/media_player/play_media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entity_id: alexaDevice,
        media_content_type: "routine",
        media_content_id: command
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
