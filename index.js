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
  } catch(e) { console.log("Lya: Iniciando novo armazenamento..."); }
  return { double: [], crash: [], crash2: [] };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch(e) { console.error("Erro ao salvar:", e); }
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

  // --- CONFIGURAÇÃO DE MEMÓRIA DA LYA ---
  if (game === 'double') {
    if (db[game].length > 2500) db[game] = db[game].slice(0, 2500); // 24h+ de Double
  } else {
    if (db[game].length > 100) db[game] = db[game].slice(0, 100);   // Apenas histórico recente
  }
}

function blazeFetch(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'blaze1.space',
      path: urlPath,
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://blaze1.space/'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Erro no JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
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
      const data = await blazeFetch(urlPath);
      const records = Array.isArray(data) ? data : (data.records || data.data || []);
      
      if (records.length > 0) {
        addRecords(db, game, records);
        changed = true;
      }
    } catch(e) {
      console.error(`Erro ${game}:`, e.message);
    }
  }

  if (changed) {
    saveDB(db);
    console.log(`Status: Double(${db.double.length}) | Crash(${db.crash.length})`);
  }
}

// Coleta a cada 15 segundos
collect();
setInterval(collect, 15000);

// Rota para o Front-end pegar os dados
app.get('/:game/history', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  if (!db[game]) return res.status(404).send("Jogo não existe");
  res.json({ ok: true, data: db[game] });
});

app.get('/', (req, res) => {
  res.send("CS Suite Proxy Ativo - Lya");
});

app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
