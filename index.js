const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();

// O Railway define a porta automaticamente, mas o seu HTML precisa que o CORS esteja aberto
app.use(cors());

let cache = { double: [], crash: [], crash2: [] };

// Função de formatação exigida pelo seu cs-suite-mobile.html
function formatToBlaze(item) {
    const colorMap = { 0: 'white', 1: 'red', 2: 'black' };
    return {
        id: item.id || Math.random().toString(),
        color: item.color || colorMap[item.color_index] || 'red',
        value: item.roll || item.value || 0,
        created_at: item.created_at || new Date().toISOString()
    };
}

function updateData() {
    https.get('https://api.casinos-fiables.com/blaze/double', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const records = json.records || json.data || json;
                if (Array.isArray(records)) {
                    cache.double = records.slice(0, 50).map(formatToBlaze);
                    console.log(`[Lya] Dados carregados: ${cache.double.length}`);
                }
            } catch(e) {}
        });
    }).on('error', () => {});
}

setInterval(updateData, 20000);
updateData();

// Rotas que o seu arquivo HTML chama (functions startLive e update)
app.get('/:game/history', (req, res) => res.json({ ok: true, data: cache[req.params.game] || [] }));
app.get('/:game/latest', (req, res) => {
    const list = cache[req.params.game] || [];
    res.json({ ok: true, data: list.slice(0, 1) });
});

// Rota de teste para o botão "TESTAR" do seu HTML
app.get('/', (req, res) => res.json({ ok: true, status: "Proxy Lya Ativo" }));

// IMPORTANTE: O Railway exige que usemos process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));
