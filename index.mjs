import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════
// ENDPOINTS ATUALIZADOS DA BLAZE (2026)
// ══════════════════════════════════════════════════════════
const BLAZE_HOSTS = ['blaze.bet.br', 'blaze.com'];
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

// Novos endpoints de histórico da Blaze
const BLAZE_PATHS = {
  double: '/api/singleplayer-originals/originals/roulette_games/recent/1',
  crash:  '/api/singleplayer-originals/originals/crash_games/recent/4',
  crash2: '/api/singleplayer-originals/originals/crash_games/recent/2',
};

function randUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

// Faz um request HTTP/HTTPS genérico
function doRequest(urlStr, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const headers = Object.assign({
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      'User-Agent':      randUA(),
      'Cache-Control':   'no-cache',
    }, extraHeaders || {});

    const req = lib.request({
      hostname: u.hostname, port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search, method: 'GET',
      headers, timeout: 10000,
    }, (res) => {
      if (res.statusCode === 429 || res.statusCode === 403) {
        res.resume(); return reject(new Error('blocked_' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(e) { reject(new Error('parse')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Normaliza diferentes formatos de resposta
function normalizeRecords(data, game) {
  const list = Array.isArray(data) ? data : (data.data || data.records || data.items || []);
  if (!list || !list.length) return null;

  return list.map(item => {
    // Double (roulette_games)
    if (game === 'double') {
      const colorMap = { 0: 'white', 1: 'red', 2: 'black' };
      return {
        id:         item.id || String(Math.random()),
        color:      colorMap[item.color] || 'red',
        roll:       item.roll !== undefined ? item.roll : 0,
        created_at: item.created_at || new Date().toISOString(),
      };
    }
    // Crash / Crash2 (crash_games)
    return {
      id:          item.id || String(Math.random()),
      crash_point: parseFloat(item.crash_point || item.multiplier || item.point || 1),
      created_at:  item.created_at || new Date().toISOString(),
    };
  }).filter(r => r.id);
}

// ══════════════════════════════════════════════════════════
// BANCO DE DADOS PERSISTENTE (em memória para Railway)
// ══════════════════════════════════════════════════════════
const db = { double: [], crash: [], crash2: [] };

function addRecords(game, records) {
  const seen = new Set(db[game].map(r => r.id));
  let added = 0;
  for (const r of records) {
    if (r && r.id && !seen.has(r.id)) { db[game].push(r); seen.add(r.id); added++; }
  }
  db[game].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (db[game].length > 6000) db[game] = db[game].slice(0, 6000);
  return added;
}

// ══════════════════════════════════════════════════════════
// COLETA AUTOMÁTICA
// ══════════════════════════════════════════════════════════
const stats = { double: { ok: 0, err: 0 }, crash: { ok: 0, err: 0 }, crash2: { ok: 0, err: 0 } };

async function fetchGame(game) {
  // Tenta todos os hosts
  for (const host of BLAZE_HOSTS) {
    try {
      const p = BLAZE_PATHS[game];
      if (!p) continue;
      await sleep(200 + Math.random() * 400);
      const data = await doRequest('https://' + host + p, {
        'Host':           host,
        'Origin':         'https://' + host,
        'Referer':        'https://' + host + '/',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
      });
      const records = normalizeRecords(data, game);
      if (records && records.length) return records;
    } catch(e) { /* tenta próximo host */ }
  }
  return null;
}

async function collectGame(game) {
  const records = await fetchGame(game);
  if (records && records.length) {
    const added = addRecords(game, records);
    stats[game].ok++;
    console.log('[' + game + '] +' + added + ' novos (' + records.length + ' recebidos)');
  } else {
    stats[game].err++;
    console.log('[' + game + '] sem dados — tentativa ' + stats[game].err);
  }
}

async function collectAll() {
  await collectGame('double');
  await sleep(700 + Math.random() * 800);
  await collectGame('crash');
  await sleep(700 + Math.random() * 800);
  await collectGame('crash2');
}

function scheduleNext() {
  // intervalo variável 8–16s evita padrão fixo
  setTimeout(async () => { await collectAll(); scheduleNext(); }, 8000 + Math.random() * 8000);
}

collectAll();
scheduleNext();

// ══════════════════════════════════════════════════════════
// ROTAS
// ══════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    ok: true, status: 'CS Suite Proxy v4 (Railway)',
    records: { double: db.double.length, crash: db.crash.length, crash2: db.crash2.length },
    stats, ts: new Date().toISOString(),
  });
});

// Último resultado — tenta ao vivo, fallback do banco
app.get('/:game/latest', async (req, res) => {
  const game = req.params.game;
  if (!['double','crash','crash2'].includes(game)) return res.status(404).json({ ok: false });
  const live = await fetchGame(game);
  if (live && live.length) return res.json({ ok: true, data: live.slice(0, 1) });
  res.json({ ok: true, data: db[game].slice(0, 1), source: 'db' });
});

// Histórico completo do banco
app.get('/:game/history', (req, res) => {
  const game = req.params.game;
  if (!['double','crash','crash2'].includes(game)) return res.status(404).json({ ok: false });
  res.json({ ok: true, data: db[game] });
});

// Histórico por intervalo — para as listas 24h
app.get('/history/range', (req, res) => {
  const { game, from, to } = req.query;
  if (!game || !['double','crash','crash2'].includes(game))
    return res.status(400).json({ ok: false, error: 'game invalido' });
  const f = from ? new Date(from) : new Date(0);
  const t = to   ? new Date(to)   : new Date();
  res.json({ ok: true, data: db[game].filter(r => {
    const d = new Date(r.created_at || 0); return d >= f && d <= t;
  })});
});

app.listen(PORT, '0.0.0.0', () => console.log('CS Suite Proxy v4 rodando na porta ' + PORT));
