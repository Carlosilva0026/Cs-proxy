const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
  newRecords.forEach(r => {
    const id = r.id || r.uuid;
    if (id && !existing.has(id)) {
      db[game].push(r);
      existing.add(id);
    }
  });
  db[game].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const limit = (game === 'double') ? 2500 : 100;
  if (db[game].length > limit) db[game] = db[game].slice(0, limit);
}

// LYA: Rodízio de domínios para evitar o "data: []"
const BLAZE_HOSTS = ['blaze.com', 'blaze1.space', 'blaze-4.com', 'blaze-6.com'];

function fetchWithRetry(urlPath, hostIndex = 0) {
  return new Promise((resolve, reject) => {
    if (hostIndex >= BLAZE_HOSTS.length) return reject(new Error('Todos os domínios falharam'));

    const options = {
      hostname: BLAZE_HOSTS[hostIndex],
      path: urlPath,
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (data.trim().startsWith('<')) throw new Error('HTML');
          resolve(JSON.parse(data));
        } catch(e) {
          // Se falhar, tenta o próximo domínio da lista
          fetchWithRetry(urlPath, hostIndex + 1).then(resolve).catch(reject);
        }
      });
    });
    req.on('error', () => fetchWithRetry(urlPath, hostIndex + 1).then(resolve).catch(reject));
    req.setTimeout(6000, () => { req.destroy(); });
    req.end();
  });
}

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
      const data = await fetchWithRetry(urlPath);
      const records = Array.isArray(data) ? data : (data.records || data.data || []);
      if (records.length > 0) {
        addRecords(db, game, records);
        changed = true;
      }
    } catch(e) { console.error(`Erro ${game}: Sem resposta dos domínios`); }
  }

  if (changed) {
    saveDB(db);
    console.log(`[Lya] Sucesso! Double: ${db.double.length} registros.`);
  }
}

collect();
setInterval(collect, 20000);

// --- ROTAS PARA O NETLIFY ---

app.get('/', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, status: "Lya Proxy Online", double_count: db.double.length });
});

app.get('/:game/history', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  if (!db[game]) return res.json({ ok: false, data: [] });
  res.json({ ok: true, data: db[game] });
});

app.get('/:game/latest', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  res.json({ ok: true, data: db[game] ? db[game].slice(0, 1) : [] });
});

app.get('/history/range', (req, res) => {
  const { game, from, to } = req.query;
  const db = loadDB();
  if (!game || !db[game]) return res.json({ ok: false, data: [] });
  const fromDate = from ? new Date(from) : new Date(0);
  const toDate = to ? new Date(to) : new Date();
  const filtered = db[game].filter(r => {
    const d = new Date(r.created_at || 0);
    return d >= fromDate && d <= toDate;
  });
  res.json({ ok: true, data: filtered });
});

app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
