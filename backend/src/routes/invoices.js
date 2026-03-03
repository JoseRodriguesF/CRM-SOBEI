const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const invoicesController = require('../controllers/invoicesController');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');

// garante que a pasta de uploads existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({ storage });

router.post('/upload', upload.single('file'), invoicesController.uploadInvoice);
router.get('/', invoicesController.listInvoices);
router.get('/dashboard', invoicesController.getDashboard);
router.post('/send-email', invoicesController.sendInvoicesEmail);
router.delete('/:id', invoicesController.deleteInvoice);
router.patch('/:id/status', invoicesController.updateInvoiceStatus);

module.exports = router;

