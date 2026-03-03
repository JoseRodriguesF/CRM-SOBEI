require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const invoicesRouter = require('./routes/invoices');

const app = express();

app.use(cors());
app.use(express.json());

// pasta pública para servir PDFs
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/invoices', invoicesRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Servidor backend rodando na porta ${PORT}`);
});

