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
let lastIntent = null;

// --- Autenticazione solo per /ma/latest-url ---
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

// --- Ricezione intent da Music Assistant SENZA auth ---
app.post(['/alexa/intents', '/alexa/intents/'], (req, res) => {
  const { intent, slots } = req.body;

  if (!intent) return res.status(400).json({ error: 'Missing intent' });

  lastIntent = { intent, slots };
  console.log('Received intent from MA:', lastIntent);

  res.json({ status: 'ok' });
});

app.get(['/alexa/intents', '/alexa/intents/'], (req, res) => {
    res.status(405).send('Use POST for intents');
});

// --- Facoltativo: endpoint per leggere l'ultimo intent (debug) ---
// Proxy per MA: accetta GET e lo trasforma in POST
app.get(['/alexa/intents', '/alexa/intents/'], (req, res) => {
  const intent = req.query.intent;
  const slots = req.query.slots ? JSON.parse(req.query.slots) : {};

  if (!intent) return res.status(400).json({ error: 'Missing intent' });

  // Chiama il POST interno
  const postReq = {
    body: { intent, slots }
  };

  // Usa lo stesso handler del POST
  app._router.handle(
    { ...req, method: 'POST', body: postReq.body },
    res,
    () => {}
  );
});

app.listen(PORT, () => {
  console.log(`MA-Alexa API running on port ${PORT}`);
});
