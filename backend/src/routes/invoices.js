const express = require('express');
const multer = require('multer');
const path = require('path');

const invoicesController = require('../controllers/invoicesController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
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

module.exports = router;

