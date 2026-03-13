const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();
const PORT    = process.env.PORT || 8080;

app.use(cors());

// Cache para armazenar os dados e não deixar o site vazio
let cache = { double: [], crash: [], crash2: [] };

// Função para formatar os dados como o seu HTML 'hstone' espera
function formatToBlaze(item) {
    const colorMap = { 0: 'white', 1: 'red', 2: 'black' };
    return {
        id: item.id || Math.random().toString(),
        color: item.color || colorMap[item.color_index] || 'red',
        value: item.roll || item.value || 0,
        created_at: item.created_at || new Date().toISOString()
    };
}

// Coletor de dados de fonte estável (sem bloqueio)
function updateData() {
    https.get('https://api.casinos-fiables.com/blaze/double', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const records = json.records || json.data || json;
                if (Array.isArray(records)) {
                    // Aqui transformamos os dados no formato que o seu 'hstone' lê
                    cache.double = records.slice(0, 50).map(formatToBlaze);
                    console.log(`[Lya] Sucesso: ${cache.double.length} pedras prontas.`);
                }
            } catch(e) { console.log("[Lya] Erro ao processar JSON."); }
        });
    }).on('error', (err) => console.log("[Lya] Erro de conexão."));
}

// Atualiza a cada 20 segundos
setInterval(updateData, 20000);
updateData();

// Rotas exigidas pelo seu arquivo HTML (cs-suite-mobile.html)
app.get('/:game/history', (req, res) => {
    res.json({ ok: true, data: cache[req.params.game] || [] });
});

app.get('/:game/latest', (req, res) => {
    const list = cache[req.params.game] || [];
    res.json({ ok: true, data: list.slice(0, 1) });
});

app.get('/', (req, res) => {
    res.json({ status: "Lya Proxy Online", count: cache.double.length });
});

app.listen(PORT, () => console.log(`Proxy configurado para CS Suite na porta ${PORT}`));
