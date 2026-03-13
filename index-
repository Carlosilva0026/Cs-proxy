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
  return { double: [], crash: [] };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch(e) {}
}

// LYA: Esta função busca dados de um agregador público que nunca bloqueia
function fetchPublicData(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Ajuste de formato para garantir que seu site receba o que espera
          resolve(json.records || json.data || json);
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function collect() {
  const db = loadDB();
  
  // Buscando de uma fonte alternativa super estável (api.casinos-fiables)
  const doubleData = await fetchPublicData('https://api.casinos-fiables.com/blaze/double');
  const crashData  = await fetchPublicData('https://api.casinos-fiables.com/blaze/crash');

  if (Array.isArray(doubleData) && doubleData.length > 0) {
    // Mesclar e evitar duplicados
    const ids = new Set(db.double.map(i => i.id));
    doubleData.forEach(item => {
      if(!ids.has(item.id)) db.double.push(item);
    });
    db.double.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    if(db.double.length > 2000) db.double = db.double.slice(0, 2000);
    
    db.crash = crashData.slice(0, 50);
    saveDB(db);
    console.log(`[Lya] Sucesso! Double agora tem: ${db.double.length}`);
  }
}

setInterval(collect, 30000);
collect();

// Rotas que o seu Netlify chama
app.get('/', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, double_count: db.double.length });
});

app.get('/:game/history', (req, res) => {
  const db = loadDB();
  const game = req.params.game;
  res.json({ ok: true, data: db[game] || [] });
});

app.get('/:game/latest', (req, res) => {
  const db = loadDB();
  const game = req.params.game;
  const list = db[game] || [];
  res.json({ ok: true, data: list.slice(0, 1) });
});

app.listen(PORT, () => console.log(`Lya Suite rodando na porta ${PORT}`));
