const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Banco de dados simples (arquivo JSON) ──────────────────
const DB_FILE = path.join('/tmp', 'cs_db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) {}
  return { double: [], crash: [], crash2: [] };
}
function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch(e) {}
}

// Mantém no máximo 5000 registros por jogo
function addRecords(db, game, newRecords) {
  const existing = new Set(db[game].map(r => r.id));
  for (const r of newRecords) {
    if (!existing.has(r.id)) {
      db[game].push(r);
      existing.add(r.id);
    }
  }
  // ordena por data decrescente e limita
  db[game].sort((a, b) => new Date(b.created_at||0) - new Date(a.created_at||0));
  if (db[game].length > 5000) db[game] = db[game].slice(0, 5000);
}

// ── Fetch da Blaze ─────────────────────────────────────────
function blazeFetch(urlPath) {
  // tenta crash_2 se crash2 falhar (fallback automático)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'blaze1.space',
      path: urlPath,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('parse')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Tenta crash_2, fallback para crash-2
async function fetchCrash2(endpoint) {
  try {
    return await blazeFetch(`/api/singleplayer-originals/originals/crash_2/${endpoint}`);
  } catch(e) {
    return await blazeFetch(`/api/singleplayer-originals/originals/crash-2/${endpoint}`);
  }
}

// ── Coleta automática a cada 10s ───────────────────────────
const BLAZE_ROUTES = {
  double: '/api/singleplayer-originals/originals/double/history',
  crash:  '/api/singleplayer-originals/originals/crash/history',
};

async function collect() {
  const db = loadDB();
  let changed = false;

  // Double e Crash
  for (const [game, urlPath] of Object.entries(BLAZE_ROUTES)) {
    try {
      const data = await blazeFetch(urlPath);
      const records = Array.isArray(data) ? data : (data.data || data.records || []);
      if (records.length) { addRecords(db, game, records); changed = true; }
    } catch(e) { /* silencioso */ }
  }

  // Crash2 com fallback
  try {
    const data = await fetchCrash2('history');
    const records = Array.isArray(data) ? data : (data.data || data.records || []);
    if (records.length) { addRecords(db, 'crash2', records); changed = true; }
  } catch(e) { /* silencioso */ }

  if (changed) saveDB(db);
}

// Coleta imediata + a cada 10 segundos
collect();
setInterval(collect, 10000);

// ── Rotas ──────────────────────────────────────────────────

app.get('/', (req, res) => {
  const db = loadDB();
  res.json({
    status: 'ok',
    service: 'CS Suite Proxy',
    records: { double: db.double.length, crash: db.crash.length, crash2: db.crash2.length },
    ts: new Date().toISOString()
  });
});

// Últimos N resultados
app.get('/:game/latest', async (req, res) => {
  const game = req.params.game;
  if (!['double','crash','crash2'].includes(game)) return res.status(404).json({ ok:false });
  try {
    let data;
    if (game === 'crash2') {
      data = await fetchCrash2('search/1');
    } else {
      data = await blazeFetch(`/api/singleplayer-originals/originals/${game}/search/1`);
    }
    res.json({ ok:true, data });
  } catch(e) {
    // fallback: retorna do banco
    const db = loadDB();
    res.json({ ok:true, data: db[game].slice(0,1) });
  }
});

// Histórico completo do banco
app.get('/:game/history', (req, res) => {
  const game = req.params.game;
  if (!['double','crash','crash2'].includes(game)) return res.status(404).json({ ok:false });
  const db = loadDB();
  res.json({ ok:true, data: db[game] });
});

// Histórico por intervalo de datas (para as listas)
app.get('/history/range', (req, res) => {
  const { game, from, to } = req.query;
  if (!game || !['double','crash','crash2'].includes(game))
    return res.status(400).json({ ok:false, error:'game invalido' });
  const db = loadDB();
  const fromDate = from ? new Date(from) : new Date(0);
  const toDate   = to   ? new Date(to)   : new Date();
  const filtered = db[game].filter(r => {
    const d = new Date(r.created_at || 0);
    return d >= fromDate && d <= toDate;
  });
  res.json({ ok:true, data: filtered });
});

app.listen(PORT, () => console.log(`CS Suite Proxy rodando na porta ${PORT}`));
