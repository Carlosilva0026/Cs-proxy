const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 8080;

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
  if (db[game].length > 2500) db[game] = db[game].slice(0, 2500);
}

// LYA: Função que busca de fontes alternativas se a Blaze bloquear
function fetchBackup(game) {
  return new Promise((resolve) => {
    // Usando um espelho de API que não bloqueia datacenters
    const url = game === 'double' 
      ? 'https://api.casinos-fiables.com/blaze/double' 
      : 'https://api.casinos-fiables.com/blaze/crash';
      
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.records || json.data || json);
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function collect() {
  const db = loadDB();
  let changed = false;

  // Foco no Double para sua estratégia
  try {
    const records = await fetchBackup('double');
    if (records.length > 0) {
      addRecords(db, 'double', records);
      changed = true;
    }
    
    // Crash
    const crashRecs = await fetchBackup('crash');
    if (crashRecs.length > 0) {
      addRecords(db, 'crash', crashRecs);
      addRecords(db, 'crash2', crashRecs);
      changed = true;
    }
  } catch(e) {}

  if (changed) {
    saveDB(db);
    console.log(`[Lya] Sucesso! Banco atualizado. Double: ${db.double.length}`);
  }
}

collect();
setInterval(collect, 20000);

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

app.listen(PORT, () => console.log(`Proxy Lya Online na porta ${PORT}`));
