const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Banco de dados (Arquivo JSON) ──────────────────
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

function addRecords(db, game, newRecords) {
  if (!Array.isArray(newRecords)) return;
  const existing = new Set(db[game].map(r => r.id || r.uuid));
  for (const r of newRecords) {
    const id = r.id || r.uuid;
    if (id && !existing.has(id)) {
      db[game].push(r);
      existing.add(id);
    }
  }
  db[game].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  
  // Memória: 2500 para Double (24h), 100 para os outros
  const limit = (game === 'double') ? 2500 : 100;
  if (db[game].length > limit) db[game] = db[game].slice(0, limit);
}

// ── Fetch da Blaze com Headers Reais ─────────────────
function blazeFetch(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'blaze.com',
      path: urlPath,
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://blaze.com/pt/games/double',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { 
          if (data.trim().startsWith('<')) return reject(new Error('HTML_ERROR'));
          resolve(JSON.parse(data)); 
        } catch(e) { reject(new Error('PARSE_ERROR')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.end();
  });
}

// ── Coleta Automática ─────────────────────────────
const BLAZE_ROUTES = {
  double: '/api/roulette_games/recent',
  crash:  '/api/crash_games/recent',
  crash2: '/api/crash_games/recent?game_type=crash2'
};

async function collect() {
  const db = loadDB();
  let changed = false;

  for (const [game, urlPath] of Object.entries(BLAZE_ROUTES)) {
    try {
      const data = await blazeFetch(urlPath);
      const records = Array.isArray(data) ? data : (data.records || data.data || []);
      if (records.length) { addRecords(db, game, records); changed = true; }
    } catch(e) { console.error(`Erro ${game}:`, e.message); }
  }

  if (changed) saveDB(db);
}

collect();
setInterval(collect, 15000);

// ── Rotas Exigidas pelo Front-end ──────────────────

// Rota raiz que o botão "TESTAR" valida
app.get('/', (req, res) => {
  const db = loadDB();
  res.json({
    ok: true, // Essencial para o seu site aceitar
    status: 'ok',
    service: 'CS Suite Proxy',
    records: { double: db.double.length, crash: db.crash.length, crash2: db.crash2.length },
    ts: new Date().toISOString()
  });
});

// Rota de histórico que o site usa para as listas
app.get('/:game/history', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  if (!db[game]) return res.status(404).json({ ok: false });
  res.json({ ok: true, data: db[game] });
});

// Rota de range (Filtros do dia anterior)
app.get('/history/range', (req, res) => {
  const { game, from, to } = req.query;
  const db = loadDB();
  if (!game || !db[game]) return res.status(400).json({ ok: false });

  const fromDate = from ? new Date(from) : new Date(0);
  const toDate   = to   ? new Date(to)   : new Date();

  const filtered = db[game].filter(r => {
    const d = new Date(r.created_at || 0);
    return d >= fromDate && d <= toDate;
  });

  res.json({ ok: true, data: filtered });
});

// Rota para o último resultado individual
app.get('/:game/latest', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  if (!db[game]) return res.status(404).json({ ok: false });
  res.json({ ok: true, data: db[game].slice(0, 1) });
});

app.listen(PORT, () => console.log(`Proxy Lya Ativo na porta ${PORT}`));
            
