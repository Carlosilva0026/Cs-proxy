import express from 'express';
import cors from 'cors';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Banco de dados temporário em memória
let db = { double: [], crash: [], crash2: [] };

// Função para converter os dados para o formato que o seu HTML (hstone) exige
function formatData(records, game) {
    if (!Array.isArray(records)) return [];
    return records.map(item => {
        // Tradução de cores para o Double
        let colorName = 'red';
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

// Coletor de dados (Lya Edition) - Busca de fontes que não bloqueiam
async function collect() {
    const games = ['double', 'crash'];
    
    for (const game of games) {
        https.get(`https://api.casinos-fiables.com/blaze/${game}`, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const records = json.records || json.data || json;
                    if (Array.isArray(records)) {
                        db[game] = formatData(records, game);
                        if (game === 'crash') db['crash2'] = db[game]; // Espelha para o crash2
                    }
                } catch (e) { console.log(`Erro ao processar ${game}`); }
            });
        }).on('error', () => console.log(`Erro de conexão em ${game}`));
    }
}

// Inicia a coleta e repete a cada 20 segundos
collect();
setInterval(collect, 20000);

// ROTA PARA O BOTÃO "TESTAR" DO SEU HTML
app.get('/', (req, res) => {
    res.json({ ok: true, status: "Lya Proxy Active", count: db.double.length });
});

// ROTAS QUE O SEU HTML CHAMA
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
    console.log(`Servidor rodando na porta ${PORT}`);
});
