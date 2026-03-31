require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const invoicesRouter = require('./routes/invoices');
const unitsRouter = require('./routes/units');

const app = express();

app.use(cors());
app.use(express.json());

// Servir PDFs publicamente
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/invoices', invoicesRouter);
app.use('/api/units', unitsRouter);

// Middleware global de erros — impede que stack traces vazem ao cliente
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server] Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend rodando em http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[Server] ${signal} recebido. Encerrando servidor...`);
  server.close(() => {
    console.log('[Server] Servidor encerrado.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
