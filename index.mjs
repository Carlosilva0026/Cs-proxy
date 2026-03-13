import express from 'express';
import cors from 'cors';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Banco de dados em memória
let db = { double: [], crash: [], crash2: [] };

// LYA: Esta função traduz os dados para o seu HTML "cs-suite-mobile-CORRIGIDO.html"
function formatData(records) {
    if (!Array.isArray(records)) return [];
    return records.map(item => {
        let colorName = 'red';
        // Tradução: Blaze envia 0, 1, 2. Seu CSS espera 'white', 'red', 'black'
        if (item.color === 0 || item.color === 'white') colorName = 'white';
        else if (item.color === 2 || item.color === 'black') colorName = 'black';

        return {
            id: item.id || Math.random().toString(),
            color: colorName,
            value: item.roll || item.value || 0,
            created_at: item.created_at || new Date().toISOString()
        };
    });
}

// Coletor automático usando fonte que não bloqueia o Railway
async function collect() {
    https.get('https://api.casinos-fiables.com/blaze/double', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const records = json.records || json.data || json;
                if (Array.isArray(records)) {
                    db.double = formatData(records);
                    console.log(`[Lya] Monitor atualizado: ${db.double.length} pedras.`);
                }
            } catch (e) {}
        });
    }).on('error', () => {});
}

// Atualiza a cada 20 segundos
setInterval(collect, 20000);
collect();

// ROTA PARA O BOTÃO "TESTAR" (Resolve o erro do seu print)
app.get('/', (req, res) => {
    res.json({ ok: true, status: "Proxy Lya Online", count: db.double.length });
});

// ROTAS DE DADOS
app.get('/:game/history', (req, res) => {
    const game = req.params.game;
    res.json({ ok: true, data: db[game] || [] });
});

app.get('/:game/latest', (req, res) => {
    const game = req.params.game;
    const list = db[game] || [];
    res.json({ ok: true, data: list.slice(0, 1) });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Lya rodando na porta ${PORT}`);
});
