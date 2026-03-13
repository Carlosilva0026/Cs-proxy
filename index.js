const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Armazenamento temporário no Railway
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

  // Double com histórico para estratégia (2500 rodadas), Crash apenas recente
  if (game === 'double') {
    if (db[game].length > 2500) db[game] = db[game].slice(0, 2500);
  } else {
    if (db[game].length > 50) db[game] = db[game].slice(0, 50);
  }
}

function blazeFetch(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'blaze.com',
      path: urlPath,
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
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
          if (data.trim().startsWith('<')) {
            reject(new Error('Bloqueio Cloudflare'));
          } else {
            resolve(JSON.parse(data));
          }
        } catch(e) { reject(new Error('Resposta Inválida')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
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
      console.error(`[Lya Log] Erro ${game}: ${e.message}`);
    }
  }

  if (changed) {
    saveDB(db);
    console.log(`[Lya Log] Database atualizada. Double: ${db.double.length}`);
  }
}

// Coleta a cada 20 segundos
collect();
setInterval(collect, 20000);

// --- ROTAS PARA O SITE (NETLIFY) ---

// Rota de teste que o botão "TESTAR" do site chama
app.get('/', (req, res) => {
  const db = loadDB();
  res.json({ 
    ok: true, 
    status: "Online", 
    double_count: db.double.length,
    monitor: "Lya Suite Active"
  });
});

// Rota que entrega o histórico para as listas do site
app.get('/:game/history', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  if (!db[game]) return res.status(404).json({ ok: false, msg: "Jogo inválido" });
  res.json({ ok: true, data: db[game] });
});

app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
