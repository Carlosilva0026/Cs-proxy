const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();
const PORT    = process.env.PORT || 8080;

app.use(cors());

// Banco de dados em memória
let cache = { double: [], crash: [] };

// LYA: Função que traduz os dados para o formato exato da Blaze
function formatBlaze(item) {
    return {
        id: item.id || Math.random(),
        color: item.color || (item.roll <= 7 ? 'red' : 'black'), // Traduz número em cor
        roll: item.roll || item.value || 0,
        created_at: item.created_at || new Date().toISOString()
    };
}

function fetchExternal() {
    https.get('https://api.casinos-fiables.com/blaze/double', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const records = json.records || json.data || json;
                if (Array.isArray(records)) {
                    // Mapeia e traduz cada item para o padrão da Blaze
                    cache.double = records.map(formatBlaze);
                    console.log(`[Lya] ${cache.double.length} rodadas formatadas.`);
                }
            } catch(e) { console.log("Erro na formatação."); }
        });
    }).on('error', () => {});
}

setInterval(fetchExternal, 20000);
fetchExternal();

app.get('/', (req, res) => res.json({ ok: true, double_count: cache.double.length }));

app.get('/:game/history', (req, res) => {
    res.json({ ok: true, data: cache[req.params.game] || [] });
});

app.get('/:game/latest', (req, res) => {
    const list = cache[req.params.game] || [];
    res.json({ ok: true, data: list.slice(0, 1) });
});

// Rotas extras que o seu site pode estar pedindo
app.get('/history/range', (req, res) => res.json({ ok: true, data: cache.double }));

app.listen(PORT, () => console.log(`Lya Suite Final na porta ${PORT}`));
