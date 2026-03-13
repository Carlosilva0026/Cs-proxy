const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 8080; // Forçando a porta que vi no seu log

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
  if (!Array.isArray(newRecords) || newRecords.length === 0) return;
  const existing = new Set(db[game].map(r => r.id || r.uuid));
  newRecords.forEach(r => {
    const id = r.id || r.uuid;
    if (id && !existing.has(id)) {
      db[game].push(r);
      existing.add(id);
    }
  });
  db[game].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const limit = (game === 'double') ? 2500 : 50;
  if (db[game].length > limit) db[game] = db[game].slice(0, limit);
}

// LYA: Nova função de busca usando a API de espelhamento
function fetchBlaze(urlPath) {
  return new Promise((resolve, reject) => {
    // Vamos tentar o domínio secundário que costuma estar liberado
    const options = {
      hostname: 'blaze-4.com', 
      path: urlPath,
      method: 'GET',
      headers: { 
        'authority': 'blaze-4.com',
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'referer': 'https://blaze-4.com/pt/games/double',
        'x-requested-with': 'XMLHttpRequest'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (data.includes('Cloudflare') || data.startsWith('<')) {
            reject(new Error('Bloqueio'));
          } else {
            const json = JSON.parse(data);
            // A Blaze às vezes coloca os dados dentro de .records ou .data
            resolve(json.records || json.data || json);
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
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
      const records = await fetchBlaze(urlPath);
      if (Array.isArray(records) && records.length > 0) {
        addRecords(db, game, records);
        changed = true;
      }
    } catch(e) {
      console.log(`[Lya] Tentando recuperar ${game}...`);
    }
  }

  if (changed) {
    saveDB(db);
    console.log(`[Lya] Dados coletados! Double agora tem: ${db.double.length}`);
  }
}

// Inicia a coleta e repete a cada 15 segundos
collect();
setInterval(collect, 15000);

// Rotas para o site
app.get('/', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, double_count: db.double.length });
});

app.get('/:game/history', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  res.json({ ok: true, data: db[game] || [] });
});

app.get('/:game/latest', (req, res) => {
  const { game } = req.params;
  const db = loadDB();
  res.json({ ok: true, data: db[game] ? db[game].slice(0, 1) : [] });
});

app.listen(PORT, () => console.log(`Proxy Lya rodando na porta ${PORT}`));
       
