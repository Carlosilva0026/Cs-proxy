const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();

// Liberação total de acesso para o Netlify não travar a conexão
app.use(cors({ origin: '*' }));

let cache = { double: [], crash: [], crash2: [] };

// Formatação exigida pelas classes CSS e funções do seu HTML
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
    // Usando fonte externa estável para evitar o bloqueio da Blaze no Railway
    https.get('https://api.casinos-fiables.com/blaze/double', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const records = json.records || json.data || json;
                if (Array.isArray(records)) {
                    cache.double = records.slice(0, 50).map(formatToBlaze);
                    console.log(`[Lya] Dados atualizados: ${cache.double.length} registros`);
                }
            } catch(e) {}
        });
    }).on('error', () => {});
}

setInterval(updateData, 20000);
updateData();

// Rota para o botão "TESTAR" do seu arquivo HTML
app.get('/', (req, res) => {
    res.json({ ok: true, status: "Proxy Lya Ativo" });
});

// Rotas de histórico e últimas rodadas usadas pelo seu script startLive()
app.get('/:game/history', (req, res) => {
    res.json({ ok: true, data: cache[req.params.game] || [] });
});

app.get('/:game/latest', (req, res) => {
    const list = cache[req.params.game] || [];
    res.json({ ok: true, data: list.slice(0, 1) });
});

// Porta dinâmica para o Railway (8080 ou a que ele definir)
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor ativo na porta ${PORT}`));
