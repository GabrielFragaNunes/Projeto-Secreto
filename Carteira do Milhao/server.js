const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { PluggyClient } = require('pluggy-sdk');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CONNECTIONS_FILE = path.join(__dirname, 'pluggy-connections.json');

function loadPluggyConnections() {
  try {
    return JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function savePluggyConnections(connections) {
  fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(connections, null, 2));
}

const pluggyConnectionState = {
  connections: loadPluggyConnections(),
  lastUpdated: null
};

const pluggyWebhookState = {
  lastEvent: null,
  lastEventAt: null
};

function createPluggyClient() {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('CLIENT_ID e CLIENT_SECRET não configurados.');
  }

  return new PluggyClient({ clientId, clientSecret });
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const METADATA = {
  investor: 'Gabriel Fraga Nunes',
  goalAmount: 1000000,
  startAge: 26,
  startYear: 2026,
  endYear: 2040,
  lastUpdate: '29/10/2026',
  monthlyContribution: 2200,
  initialPatrimony: 85198.23,
  cdiAnnual2026: 0.1325,
  cdiAssumptionText:
    'Boletim Focus (26/10/2026): Selic em 13,25% a.a., com expectativa de cortes de 0,25 p.p. em nov/dez (Copom).'
};

const stocks = [
  { ticker: 'AGRO3', qtd: 29, preco: 16.86 },
  { ticker: 'AURE3', qtd: 89, preco: 11.03 },
  { ticker: 'B3SA3', qtd: 5, preco: 14.69 },
  { ticker: 'BBAS3', qtd: 61, preco: 16.79 },
  { ticker: 'BBSE3', qtd: 2, preco: 41.35 },
  { ticker: 'BEEF3', qtd: 10, preco: 2.89 },
  { ticker: 'BLAU3', qtd: 19, preco: 9.7 },
  { ticker: 'BMGB4', qtd: 8, preco: 5.37 },
  { ticker: 'BRSR6', qtd: 48, preco: 13.02 },
  { ticker: 'CBAV3', qtd: 68, preco: 11.33 },
  { ticker: 'CPLE3', qtd: 29, preco: 14.69 },
  { ticker: 'EGIE3', qtd: 19, preco: 27.4 },
  { ticker: 'FLRY3', qtd: 20, preco: 21.84 },
  { ticker: 'GGBR4', qtd: 52, preco: 24.09 },
  { ticker: 'ISAE4', qtd: 28, preco: 25.35 },
  { ticker: 'ITSA3', qtd: 31, preco: 13.45 },
  { ticker: 'KLBN4', qtd: 150, preco: 3.49 },
  { ticker: 'MBRF3', qtd: 20, preco: 16.75 },
  { ticker: 'PETR3', qtd: 10, preco: 59.03 },
  { ticker: 'PGMN3', qtd: 57, preco: 2.69 },
  { ticker: 'SANB11', qtd: 5, preco: 24.35 },
  { ticker: 'TAEE11', qtd: 15, preco: 39.71 },
  { ticker: 'USIM5', qtd: 2, preco: 5.69 },
  { ticker: 'VALE3', qtd: 16, preco: 61.38 },
  { ticker: 'WIZC3', qtd: 10, preco: 5.95 }
];

const fiis = [
  { ticker: 'BTLG11', qtd: 12, preco: 97.37, segmento: 'Logistica' },
  { ticker: 'GARE11', qtd: 130, preco: 8.16, segmento: 'Hibrido' },
  { ticker: 'HGLG11', qtd: 8, preco: 147.58, segmento: 'Logistica' },
  { ticker: 'HSML11', qtd: 3, preco: 78.33, segmento: 'Shopping' },
  { ticker: 'MCCI11', qtd: 22, preco: 89.9, segmento: 'Papel' },
  { ticker: 'PVBI11', qtd: 11, preco: 62.1, segmento: 'Lajes' },
  { ticker: 'SNFF11', qtd: 24, preco: 74, segmento: 'FOF' },
  { ticker: 'TGAR11', qtd: 10, preco: 40.32, segmento: 'Desenvolvimento' },
  { ticker: 'TRXF11', qtd: 10, preco: 65.5, segmento: 'Hibrido' },
  { ticker: 'VGIR11', qtd: 209, preco: 9.13, segmento: 'Papel' },
  { ticker: 'VISC11', qtd: 20, preco: 99.85, segmento: 'Shopping' },
  { ticker: 'XPLG11', qtd: 10, preco: 90.67, segmento: 'Logistica' }
];

const otherAssets = [
  { ticker: 'WRLD11', tipo: 'ETF', qtd: 3, preco: 153.28 },
  { ticker: 'VGIA11', tipo: 'Fiagro', qtd: 17, preco: 9.1 },
  { ticker: 'ROXO34', tipo: 'BDR', qtd: 2, preco: 10.7 },
  { ticker: 'CRYPTO', tipo: 'Cripto', valor: 811.54 },
  { ticker: 'CDB_SOFISA_110', tipo: 'Renda Fixa', valor: 38125.28, cdiMultiplier: 1.1 },
  { ticker: 'CDB_100', tipo: 'Renda Fixa', valor: 568.93, cdiMultiplier: 1.0 },
  { ticker: 'MERCADO_PAGO_105', tipo: 'Caixa', valor: 71463.95, cdiMultiplier: 1.05 },
  { ticker: 'MERCADO_PAGO_120', tipo: 'Caixa', valor: 10000, cdiMultiplier: 1.2 },
  { ticker: 'MERCADO_PAGO_100', tipo: 'Caixa', valor: 2309.58, cdiMultiplier: 1.0 },
  { ticker: 'DOLAR', tipo: 'Moeda', valor: 109.92 }
];

app.get('/api/patrimonio', (req, res) => {
  res.json({ METADATA, stocks, fiis, otherAssets });
});

app.get('/api/cartao', (req, res) => {
  res.json({
    limiteTotal: 9000,
    limiteDisponivel: 3650,
    valorFaturaAtual: 5350,
    transacoes: [
      { categoria: 'Alimentação', valor: 1200 },
      { categoria: 'Transporte', valor: 780 },
      { categoria: 'Lazer', valor: 960 },
      { categoria: 'Supermercado', valor: 1450 },
      { categoria: 'Saúde', valor: 430 },
      { categoria: 'Casa', valor: 530 }
    ]
  });
});

app.get('/api/pluggy-status', (req, res) => {
  const connections = pluggyConnectionState.connections;

  res.json({
    connected: connections.length > 0,
    count: connections.length,
    itemId: connections[0]?.itemId || null,
    institutionName: connections[0]?.institutionName || null,
    connections,
    lastUpdated: pluggyConnectionState.lastUpdated
  });
});

app.get('/api/pluggy-item', async (req, res) => {
  const itemId = String(req.query.itemId || pluggyConnectionState.connections[0]?.itemId || '');

  if (!itemId) {
    return res.status(404).json({ error: 'Nenhuma conta Pluggy conectada.' });
  }

  try {
    const pluggy = createPluggyClient();
    const item = await pluggy.fetchItem(itemId);
    return res.json({
      item,
      institutionName: item?.institution?.name || null,
      itemId: item?.id || itemId
    });
  } catch (error) {
    console.error('Erro ao buscar item Pluggy:', error);
    return res.status(500).json({
      error: error?.message || 'Falha ao buscar o item conectado.'
    });
  }
});

app.get('/api/pluggy-accounts', async (req, res) => {
  const requestedItemId = String(req.query.itemId || '');
  const connections = requestedItemId
    ? pluggyConnectionState.connections.filter((connection) => connection.itemId === requestedItemId)
    : pluggyConnectionState.connections;

  if (connections.length === 0) {
    return res.status(404).json({ error: 'Nenhuma conta Pluggy conectada.' });
  }

  try {
    const pluggy = createPluggyClient();
    const accountGroups = await Promise.all(connections.map(async (connection) => {
      const accounts = await pluggy.fetchAccounts(connection.itemId);
      return (accounts?.results || []).map((account) => ({
        id: account.id,
        itemId: connection.itemId,
        name: account.name,
        type: account.type,
        balance: account.balance,
        currency: account.currency,
        institutionName: account.institution?.name || connection.institutionName
      }));
    }));
    const accountSummary = accountGroups.flat();

    return res.json({
      itemIds: connections.map((connection) => connection.itemId),
      institutions: connections.map((connection) => connection.institutionName).filter(Boolean),
      accounts: accountSummary,
      totalBalance: accountSummary.reduce((sum, account) => sum + Number(account.balance || 0), 0)
    });
  } catch (error) {
    console.error('Erro ao buscar contas Pluggy:', error);
    return res.status(500).json({
      error: error?.message || 'Falha ao buscar contas do item conectado.'
    });
  }
});

app.get('/api/pluggy-transactions', async (req, res) => {
  const accountId = String(req.query.accountId || '');

  if (!accountId) {
    return res.status(400).json({ error: 'accountId é obrigatório.' });
  }

  try {
    const pluggy = createPluggyClient();
    const options = req.query.dateFrom ? { dateFrom: String(req.query.dateFrom) } : undefined;
    const transactions = await pluggy.fetchAllTransactions(accountId, options);

    return res.json({
      accountId,
      transactions,
      total: transactions.length
    });
  } catch (error) {
    console.error('Erro ao buscar transações Pluggy:', error);
    return res.status(500).json({
      error: error?.message || 'Falha ao buscar transações da conta conectada.'
    });
  }
});

app.post('/api/pluggy-status', (req, res) => {
  const { itemId, institutionName } = req.body || {};

  if (!itemId) {
    return res.status(400).json({ error: 'itemId é obrigatório.' });
  }

  const normalizedItemId = String(itemId);
  const existingConnection = pluggyConnectionState.connections.find((connection) => connection.itemId === normalizedItemId);
  const connection = {
    itemId: normalizedItemId,
    institutionName: institutionName ? String(institutionName) : null,
    connectedAt: existingConnection?.connectedAt || new Date().toISOString()
  };

  pluggyConnectionState.connections = existingConnection
    ? pluggyConnectionState.connections.map((current) => current.itemId === normalizedItemId ? connection : current)
    : [...pluggyConnectionState.connections, connection];
  savePluggyConnections(pluggyConnectionState.connections);
  pluggyConnectionState.lastUpdated = new Date().toISOString();

  return res.json({
    connected: true,
    count: pluggyConnectionState.connections.length,
    itemId: normalizedItemId,
    institutionName: connection.institutionName,
    connections: pluggyConnectionState.connections,
    lastUpdated: pluggyConnectionState.lastUpdated
  });
});

app.delete('/api/pluggy-status', (req, res) => {
  const itemId = String(req.query.itemId || '');
  pluggyConnectionState.connections = itemId
    ? pluggyConnectionState.connections.filter((connection) => connection.itemId !== itemId)
    : [];
  savePluggyConnections(pluggyConnectionState.connections);
  pluggyConnectionState.lastUpdated = new Date().toISOString();

  return res.json({
    connected: pluggyConnectionState.connections.length > 0,
    count: pluggyConnectionState.connections.length,
    connections: pluggyConnectionState.connections,
    lastUpdated: pluggyConnectionState.lastUpdated
  });
});

app.post('/api/webhooks/pluggy', (req, res) => {
  const event = req.body || {};
  const eventName = event.event || event.type || 'unknown';

  pluggyWebhookState.lastEvent = eventName;
  pluggyWebhookState.lastEventAt = new Date().toISOString();

  if (event.itemId && eventName === 'item/created') {
    const normalizedItemId = String(event.itemId);
    if (!pluggyConnectionState.connections.some((connection) => connection.itemId === normalizedItemId)) {
      pluggyConnectionState.connections.push({
        itemId: normalizedItemId,
        institutionName: event.institutionName || null,
        connectedAt: pluggyWebhookState.lastEventAt
      });
      savePluggyConnections(pluggyConnectionState.connections);
    }
    pluggyConnectionState.lastUpdated = pluggyWebhookState.lastEventAt;
  }

  console.log('Webhook Pluggy recebido:', eventName, event.eventId || 'sem eventId');
  return res.status(200).json({ received: true });
});

app.post('/api/connect-token', async (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'CLIENT_ID e CLIENT_SECRET não configurados.'
    });
  }

  try {
    const pluggy = new PluggyClient({ clientId, clientSecret });
    const { clientUserId } = req.body || {};

    const token = await pluggy.createConnectToken(undefined, {
      clientUserId: clientUserId || 'carteira-do-milhao-user'
    });

    return res.json({ accessToken: token.accessToken });
  } catch (error) {
    console.error('Erro ao criar connect token:', error);
    return res.status(500).json({
      error: error?.message || 'Falha ao criar connect token.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard + Pluggy rodando em http://localhost:${PORT}`);
});
