const express = require('express');
const auth = require('basic-auth');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

process.on('SIGINT', () => { console.log('Received SIGINT. Exiting...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('Received SIGTERM. Exiting...'); process.exit(0); });

app.use(bodyParser.json());

let obj = null;

// Basic Auth
if (USERNAME !== undefined && PASSWORD !== undefined) {
  console.log(`auth activated`);
  app.use((req, res, next) => {
    const credentials = auth(req);
    if (!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
      res.set('WWW-Authenticate', 'Basic realm="music-assistant-alexa-api"');
      return res.status(401).send('Access denied');
    }
    next();
  });
}

// --- Endpoint Music Assistant originale ---
app.post('/ma/push-url', (req, res) => {
  const { streamUrl, title, artist, album, imageUrl } = req.body;
  if (!streamUrl) return res.status(400).json({ error: 'Missing required fields' });
  obj = { streamUrl, title, artist, album, imageUrl };
  console.log('Received:', obj);
  res.json({ status: 'ok' });
});

app.get('/ma/latest-url', (req, res) => {
  if (!obj) return res.status(404).json({ error: 'No URL available' });
  res.json({ streamUrl: obj.streamUrl, title: obj.title, artist: obj.artist, album: obj.album, imageUrl: obj.imageUrl });
});

// --- Lista dispositivi Alexa per HA ---
const devices = {
  salotto: "media_player.echo_salotto",
  camera: "media_player.echo_camera_da_letto",
  ovunque: "media_player.ovunque"
};

// --- Funzione per inviare comandi a Home Assistant ---
async function sendToHA(intentName, device = "salotto") {
  const entity_id = devices[device];
  if (!entity_id) throw new Error("Dispositivo non valido");

  let service = "";
  switch(intentName) {
    case "PlayIntent": service = "media_play"; break;
    case "PauseIntent": service = "media_pause"; break;
    case "StopIntent": service = "media_stop"; break;
    default: throw new Error("Intent non valido");
  }

  const response = await fetch(`http://192.168.1.144:8123/api/services/media_player/${service}`, {
    method: "POST",
    headers: {
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmZDRiNmFlYjI2ZmE0ZDUxYTdkMTczMDI5YTY2MmFkOSIsImlhdCI6MTc3NTA1MzY2OCwiZXhwIjoyMDkwNDEzNjY4fQ.Njdnc5Fnkz1h3Z-gs2t5Jkh5aDYUyCWdv0HV5Cpv7FU",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ entity_id })
  });

  const result = await response.text();
  console.log("HA RESPONSE:", result);
}

// --- Endpoint per intent Alexa ---
app.post('/alexa/intents', async (req, res) => {
  const intent = req.body.intent;
  if (!intent) return res.status(400).json({ error: "Nessun intent fornito" });

  try {
    switch(intent) {
      case "PlayIntent":
      case "PauseIntent":
      case "StopIntent":
        await sendToHA(intent);
        break;
      default:
        return res.status(400).json({ error: "Intent non gestito" });
    }
    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// --- Avvio server ---
app.listen(PORT, () => {
  console.log(`MA-Alexa API running on port ${PORT}`);
});
