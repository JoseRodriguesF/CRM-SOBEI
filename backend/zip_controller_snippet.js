
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');

// ... existing helpers ...

exports.downloadInvoicesZip = async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ error: 'Nenhum ID de fatura fornecido.' });

    const idList = ids.split(',').map(Number);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: idList } },
    });

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Nenhuma fatura encontrada para baixar.' });
    }

    const zip = new JSZip();
    const rootDir = path.join(__dirname, '..', '..');

    for (const inv of invoices) {
      if (inv.pdfPath) {
        const fullPath = path.join(rootDir, inv.pdfPath);
        if (fs.existsSync(fullPath)) {
          const fileData = fs.readFileSync(fullPath);
          const fileName = path.basename(inv.pdfPath);
          zip.file(fileName, fileData);
        }
      }
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=faturas-sobei-${Date.now()}.zip`);
    return res.send(content);
  } catch (err) {
    console.error('[invoices] downloadZip:', err);
    return res.status(500).json({ error: 'Erro ao gerar arquivo ZIP.' });
  }
};
