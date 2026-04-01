const express = require('express');
const auth = require('basic-auth');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

process.on('SIGINT', () => {
  console.log('Received SIGINT. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Exiting...');
  process.exit(0);
});

app.use(bodyParser.json());

let obj = null;

if (USERNAME !== undefined && PASSWORD !== undefined) {
  console.log(`auth activated`);
  app.use((req, res, next) => {
    const credentials = auth(req);

    if (
      !credentials ||
      credentials.name !== USERNAME ||
      credentials.pass !== PASSWORD
    ) {
      res.set('WWW-Authenticate', 'Basic realm="music-assistant-alexa-api"');
      return res.status(401).send('Access denied');
    }

    next();
  });
}

// POST endpoint for Music Assistant to push URL and metadata
app.post('/ma/push-url', (req, res) => {
  const { streamUrl, title, artist, album, imageUrl } = req.body;

  if (!streamUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  obj = { streamUrl, title, artist, album, imageUrl };
  console.log('Received:', obj);
  res.json({ status: 'ok' });
});

// GET endpoint for Alexa skill to fetch latest URL and metadata
app.get('/ma/latest-url', (req, res) => {
  if (!obj) {
    return res.status(404).json({ error: 'No URL available' });
  }

  res.json({
    streamUrl: obj.streamUrl,
    title: obj.title,
    artist: obj.artist,
    album: obj.album,
    imageUrl: obj.imageUrl,
  });
});

app.listen(PORT, () => {
  console.log(`MA-Alexa API running on port ${PORT}`);
});

// Add custom media handlers
// server.js
const express = require('express');
const app = express();
app.use(express.json());

const PORT = 3000;

// Lista dispositivi
const devices = {
    "salotto": "media_player.echo_salotto",
    "camera": "media_player.echo_camera_da_letto",
    "ovunque": "media_player.ovunque"
};

app.post('/control', async (req, res) => {
    try {
        const command = req.body.command;
        const deviceKey = req.body.device || "salotto"; // default salotto
        const entity_id = devices[deviceKey];

        if (!entity_id) return res.status(400).json({ error: "Dispositivo non valido" });

        let service = "";
        if (command === "pause") service = "media_pause";
        if (command === "play") service = "media_play";
        if (command === "play_pause") service = "media_play_pause";
        if (command === "next") service = "media_next_track";
        if (command === "previous") service = "media_previous_track";
        if (!service) return res.status(400).json({ error: "Comando non valido" });

        // Chiamata a Home Assistant
        const response = await fetch("http://192.168.1.144:8123/api/services/media_player/" + service, {
            method: "POST",
            headers: {
                "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmZDRiNmFlYjI2ZmE0ZDUxYTdkMTczMDI5YTY2MmFkOSIsImlhdCI6MTc3NTA1MzY2OCwiZXhwIjoyMDkwNDEzNjY4fQ.Njdnc5Fnkz1h3Z-gs2t5Jkh5aDYUyCWdv0HV5Cpv7FU",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ entity_id })
        });

        const result = await response.text();
        console.log("HA RESPONSE:", result);

        res.json({ success: true });

    } catch (err) {
        console.error("ERROR:", err);
        res.status(500).json({ error: err.toString() });
    }
});

app.listen(PORT, () => {
    console.log(`Server Alexa API in ascolto su porta ${PORT}`);
});
