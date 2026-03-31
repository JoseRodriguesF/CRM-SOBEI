const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const invoicesController = require('../controllers/invoicesController');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');

// Garante que a pasta de uploads existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

/** Rejeita uploads que não sejam PDFs. */
const fileFilter = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos PDF são permitidos.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

router.post('/upload', upload.single('file'), invoicesController.uploadInvoice);
router.get('/', invoicesController.listInvoices);
router.get('/dashboard', invoicesController.getDashboard);
router.get('/download-zip', invoicesController.downloadInvoicesZip);
router.delete('/:id', invoicesController.deleteInvoice);
router.patch('/:id/status', invoicesController.updateInvoiceStatus);

module.exports = router;
