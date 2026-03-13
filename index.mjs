import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ══════════════════════════════════════════════════════════

const BLAZE_HOSTS = ['blaze.bet.br', 'blaze.com'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const BLAZE_PATHS = {
  double: '/api/singleplayer-originals/originals/roulette_games/recent/1',
  crash:  '/api/singleplayer-originals/originals/crash_games/recent/4',
  crash2: '/api/singleplayer-originals/originals/crash_games/recent/2',
};

function randUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

// ══════════════════════════════════════════════════════════
// REQUEST COM RETRY
// ══════════════════════════════════════════════════════════

function doRequest(urlStr, extraHeaders, retryCount = 0) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const isHttps = u.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const headers = Object.assign({
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'User-Agent': randUA(),
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }, extraHeaders || {});

      const options = {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers,
        timeout: 10000,
      };

      const req = lib.request(options, (res) => {
        if (res.statusCode === 429 || res.statusCode === 403) {
          res.resume();
          if (retryCount < 2) {
            setTimeout(() => {
              doRequest(urlStr, extraHeaders, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, 2000 + Math.random() * 2000);
          } else {
            reject(new Error('blocked'));
          }
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('status_' + res.statusCode));
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch(e) {
            reject(new Error('parse'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      req.end();
    } catch(e) {
      reject(e);
    }
  });
}

// ══════════════════════════════════════════════════════════
// NORMALIZAÇÃO
// ══════════════════════════════════════════════════════════

function normalizeRecords(data, game) {
  const list = Array.isArray(data) ? data : (data.data || data.records || []);
  if (!list || !list.length) return null;

  return list.map(item => {
    if (game === 'double') {
      const colorMap = { 0: 'white', 1: 'red', 2: 'black' };
      return {
        id: item.id || String(Math.random()),
        color: colorMap[item.color] || 'red',
        roll: item.roll !== undefined ? item.roll : 0,
        created_at: item.created_at || new Date().toISOString(),
      };
    }
    return {
      id: item.id || String(Math.random()),
      crash_point: parseFloat(item.crash_point || 1),
      created_at: item.created_at || new Date().toISOString(),
    };
  }).filter(r => r.id);
}

// ══════════════════════════════════════════════════════════
// BANCO DE DADOS
// ══════════════════════════════════════════════════════════

const db = { double: [], crash: [], crash2: [] };

function addRecords(game, records) {
  const seen = new Set(db[game].map(r => r.id));
  let added = 0;
  for (const r of records) {
    if (r && r.id && !seen.has(r.id)) {
      db[game].push(r);
      seen.add(r.id);
      added++;
    }
  }
  db[game].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (db[game].length > 10000) db[game] = db[game].slice(0, 10000);
  return added;
}

// ══════════════════════════════════════════════════════════
// COLETA
// ══════════════════════════════════════════════════════════

const stats = {
  double: { ok: 0, err: 0, lastOk: null },
  crash: { ok: 0, err: 0, lastOk: null },
  crash2: { ok: 0, err: 0, lastOk: null },
};

async function fetchGame(game) {
  for (const host of BLAZE_HOSTS) {
    try {
      const path = BLAZE_PATHS[game];
      if (!path) continue;

      await sleep(300 + Math.random() * 500);

      const url = 'https://' + host + path;
      const data = await doRequest(url, {
        'Host': host,
        'Origin': 'https://' + host,
        'Referer': 'https://' + host + '/pt/games/' + (game === 'double' ? 'double' : 'crash'),
      });

      const records = normalizeRecords(data, game);
      if (records && records.length > 0) {
        console.log(`[${game}] ✓ ${host} (+${records.length})`);
        return records;
      }
    } catch(e) {
      console.log(`[${game}] ✗ ${host}: ${e.message}`);
    }
  }
  return null;
}

async function collectGame(game) {
  const records = await fetchGame(game);
  if (records && records.length > 0) {
    const added = addRecords(game, records);
    stats[game].ok++;
    stats[game].lastOk = new Date().toISOString();
    console.log(`[${game}] Adicionados: ${added} | Total: ${db[game].length}`);
  } else {
    stats[game].err++;
    console.log(`[${game}] Sem dados (tentativa ${stats[game].err})`);
  }
}

async function collectAll() {
  console.log(`\n[${new Date().toISOString()}] Iniciando coleta...`);
  await collectGame('double');
  await sleep(1000);
  await collectGame('crash');
  await sleep(1000);
  await collectGame('crash2');
}

function scheduleNext() {
  const hasSuccess = Object.values(stats).some(s => s.ok > 0);
  const interval = hasSuccess ? 
    (8000 + Math.random() * 8000) :
    (15000 + Math.random() * 15000);

  setTimeout(async () => {
    await collectAll();
    scheduleNext();
  }, interval);
}

// Inicia coleta
collectAll();
scheduleNext();

// ══════════════════════════════════════════════════════════
// ROTAS
// ══════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({
    ok: true,
    status: 'CS Suite Proxy v5 - Railway',
    version: '5.0.0',
    records: {
      double: db.double.length,
      crash: db.crash.length,
      crash2: db.crash2.length,
    },
    stats,
    uptime: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
  });
});

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    proxy: 'CS Suite v5',
    database: {
      double: db.double.length,
      crash: db.crash.length,
      crash2: db.crash2.length,
    },
    stats,
    uptime: process.uptime(),
  });
});

app.get('/:game/latest', async (req, res) => {
  const game = req.params.game;
  if (!['double', 'crash', 'crash2'].includes(game)) {
    return res.status(404).json({ ok: false });
  }

  const live = await fetchGame(game);
  if (live && live.length > 0) {
    return res.json({ ok: true, data: live.slice(0, 1), source: 'live' });
  }

  res.json({
    ok: true,
    data: db[game].slice(0, 1),
    source: 'database',
  });
});

app.get('/:game/history', (req, res) => {
  const game = req.params.game;
  if (!['double', 'crash', 'crash2'].includes(game)) {
    return res.status(404).json({ ok: false });
  }

  res.json({
    ok: true,
    data: db[game],
    count: db[game].length,
  });
});

app.get('/history/range', (req, res) => {
  const { game, from, to } = req.query;
  if (!game || !['double', 'crash', 'crash2'].includes(game)) {
    return res.status(400).json({ ok: false });
  }

  const f = from ? new Date(from) : new Date(0);
  const t = to ? new Date(to) : new Date();

  const filtered = db[game].filter(r => {
    const d = new Date(r.created_at || 0);
    return d >= f && d <= t;
  });

  res.json({
    ok: true,
    data: filtered,
    count: filtered.length,
  });
});

app.get('/health', (req, res) => {
  const hasData = Object.values(db).some(arr => arr.length > 0);
  const isHealthy = hasData && Object.values(stats).some(s => s.ok > 0);

  res.status(isHealthy ? 200 : 503).json({
    ok: isHealthy,
    status: isHealthy ? 'healthy' : 'collecting',
    records: {
      double: db.double.length,
      crash: db.crash.length,
      crash2: db.crash2.length,
    },
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  CS Suite Proxy v5 - Railway          ║`);
  console.log(`║  Porta: ${PORT}                              ║`);
  console.log(`║  Status: Iniciando coleta...          ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});
