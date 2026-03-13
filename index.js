const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();
const PORT    = process.env.PORT || 8080;

app.use(cors());

// Dados iniciais para o app não abrir vazio
let cache = { 
    double: [{id: 1, color: 'red', value: 1, created_at: new Date()}], 
    crash: [] 
};

// LYA: Busca dados de um espelho que não bloqueia o Railway
function fetchExternal() {
    https.get('https://api.casinos-fiables.com/blaze/double', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const records = json.records || json.data || json;
                if (Array.isArray(records) && records.length > 0) {
                    cache.double = records;
                    console.log(`[Lya] Dados carregados: ${records.length} rodadas.`);
                }
            } catch(e) { console.log("Erro no processamento."); }
        });
    }).on('error', () => {});
}

// Atualiza a cada 30 segundos
setInterval(fetchExternal, 30000);
fetchExternal();

app.get('/', (req, res) => res.json({ ok: true, status: "Lya Active", count: cache.double.length }));

app.get('/:game/history', (req, res) => {
    res.json({ ok: true, data: cache[req.params.game] || [] });
});

app.get('/:game/latest', (req, res) => {
    const list = cache[req.params.game] || [];
    res.json({ ok: true, data: list.slice(0, 1) });
});

app.listen(PORT, () => console.log(`Servidor Lya pronto na porta ${PORT}`));
