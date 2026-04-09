const express = require('express');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// ================= BODY =================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= AUTH =================

if (USERNAME && PASSWORD) {
  app.use('/ma', (req, res, next) => {
    const credentials = auth(req);
    if (!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
      res.set('WWW-Authenticate', 'Basic realm="music-assistant"');
      return res.status(401).send('Access denied');
    }
    next();
  });
}

// ================= STATE =================

let queue = [];
let currentIndex = 0;

// ================= PUSH TRACK =================

app.post('/ma/push-url', (req, res) => {
  const track = req.body;

  if (!track.streamUrl) {
    return res.status(400).json({ error: 'Missing streamUrl' });
  }

  // 🔥 NUOVA LOGICA:
  // se arriva un nuovo brano mentre sei all’ultimo → append
  // se sei in mezzo → reset queue (nuovo contesto)

  if (currentIndex < queue.length - 1) {
    queue = [];
    currentIndex = 0;
  }

  queue.push(track);

  console.log("🎵 TRACK AGGIUNTA:", track.title);

  res.json({ status: 'ok' });
});

// ================= GET CURRENT =================

app.get('/ma/current', (req, res) => {
  if (!queue.length) {
    return res.status(404).json({ error: 'No track' });
  }

  res.json(queue[currentIndex]);
});

// ================= NEXT =================

app.get('/ma/next', (req, res) => {
  if (currentIndex < queue.length - 1) {
    currentIndex++;
  }

  res.json(queue[currentIndex]);
});

// ================= PREVIOUS =================

app.get('/ma/previous', (req, res) => {
  if (currentIndex > 0) {
    currentIndex--;
  }

  res.json(queue[currentIndex]);
});

// ================= DEBUG =================

app.get('/ma/debug', (req, res) => {
  res.json({
    queueLength: queue.length,
    currentIndex,
    currentTrack: queue[currentIndex] || null
  });
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 API attiva sulla porta ${PORT}`);
});
