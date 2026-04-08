const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIG =================

const HA_URL = 'https://valegabry.duckdns.org';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0ZWYyNDE2NTZiODI0ZTJiYmIwYTU3NDhiNDRiODRjYiIsImlhdCI6MTc3NTU4ODY3MiwiZXhwIjoyMDkwOTQ4NjcyfQ.Bh8qH8Sy9C08KJ5VAdpJ2Q_Mlo1cokkss8ggAq1Jnl4';

// ================= STATO =================

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

// 🔥 comando vocale (molto più preciso)
function buildAlexaCommand(title, artist, album) {
  if (!title || !artist) return null;

  let cmd = `Riproduci ${title} di ${artist}`;

  if (album) {
    cmd += ` dall'album ${album}`;
  }

  return cmd;
}

// ================= MAIN =================

app.post('/ma/push-url', async (req, res) => {

  console.log("\n🎯 ===== NUOVA RICHIESTA MUSIC ASSISTANT =====");

  console.log("📦 BODY:", JSON.stringify(req.body, null, 2));
  console.log("🧾 RAW:", req.rawBody);

  let { streamUrl, title, artist, album, imageUrl } = req.body;

  console.log("🎵 STREAM URL:", streamUrl);

  // fallback raw
  if ((!title || !artist) && req.rawBody) {
    try {
      const raw = JSON.parse(req.rawBody);
      title = title || raw.title;
      artist = artist || raw.artist;
      album = album || raw.album;
    } catch (e) {
      console.log("⚠️ errore parsing raw");
    }
  }

  console.log("🎵 DATI:", { title, artist, album });

  // blocco metadata mancanti
  if (!title || !artist) {
    console.log("⛔ ignorata richiesta senza metadata");
    return res.status(204).end();
  }

  // blocco duplicati
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

  const command = buildAlexaCommand(title, artist, album);

  console.log(`➡️ Device: ${alexaDevice}`);
  console.log(`➡️ Comando: ${command}`);

  try {

    // piccolo delay anti errore Alexa
    await new Promise(resolve => setTimeout(resolve, 800));

    const response = await fetch(`${HA_URL}/api/services/notify/alexa_media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: [alexaDevice],
        message: command
      })
    });

    const text = await response.text();

    console.log(`📡 STATUS: ${response.status}`);
    console.log("📡 RISPOSTA:", text);

    return res.json({ status: 'ok' });

  } catch (err) {
    console.error("❌ ERRORE:", err.message);
    return res.status(500).json({ error: 'HA error' });
  }
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
