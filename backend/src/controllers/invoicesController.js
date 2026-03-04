const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const prisma = require('../lib/prisma');
const { extractInvoiceDataFromPdf, matchUnitAndService } = require('../lib/invoiceExtractor');

// ─── Controller Actions ──────────────────────────────────────────────────────

exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo PDF é obrigatório.' });
    }

    const pdfPath = req.file.path;
    const data = await extractInvoiceDataFromPdf(pdfPath);

    // 1. Encontra ou cria a empresa (matriz) pelo CNPJ principal
    const company = await prisma.company.upsert({
      where: { cnpj: data.cnpj },
      update: {},
      create: {
        cnpj: data.cnpj,
        name: data.companyName || `Empresa ${data.cnpj}`,
      },
    });

    // 2. Tenta fazer match com unidade e serviço cadastrados
    let unitId = null;
    let serviceId = null;
    const hasMatchSignals = data.unitCnpj || data.unitAddress || data.contractNumber;

    if (hasMatchSignals) {
      const match = await matchUnitAndService(company.id, data);
      if (match.unit) {
        unitId = match.unit.id;
        serviceId = match.service ? match.service.id : null;
        console.log(`[IA] Vinculado: Unidade "${match.unit.name}"${match.service ? ` / Serviço "${match.service.name}"` : ''}`);
      }
    }

    // 3. Cria a fatura
    const invoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        unitId,
        serviceId,
        cnpj: data.cnpj,
        referenceMonth: data.referenceMonth,
        totalAmount: data.totalAmount,
        dueDate: new Date(data.dueDate + 'T12:00:00'),
        status: data.status,
        serviceName: data.service,
        pdfPath: path.relative(path.join(__dirname, '..', '..'), pdfPath).replace(/\\/g, '/'),
      },
      include: {
        company: true,
        unit: true,
        service: true,
      },
    });

    return res.status(201).json(invoice);
  } catch (err) {
    console.error('[invoices] uploadInvoice:', err);
    return res.status(500).json({ error: 'Erro ao processar fatura.', details: err.message });
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const { cnpj, status, month, unitId, service } = req.query;
    const where = {};

    if (cnpj && cnpj.trim() !== '') where.cnpj = cnpj;
    if (month && month.trim() !== '') where.referenceMonth = month;
    if (unitId && unitId !== 'undefined' && unitId !== '') where.unitId = Number(unitId);
    if (service && service.trim() !== '') where.serviceName = { contains: service, mode: 'insensitive' };

    if (status) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (status === 'ATRASADA') {
        where.status = 'ABERTA';
        where.dueDate = { lt: today };
      } else if (status === 'ABERTA') {
        where.status = 'ABERTA';
        where.dueDate = { gte: today };
      } else {
        where.status = status;
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: { company: true, unit: true, service: true },
      orderBy: { dueDate: 'desc' },
    });

    return res.json(invoices);
  } catch (err) {
    console.error('[invoices] listInvoices:', err);
    return res.status(500).json({ error: 'Erro ao listar faturas.' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const { month, unitId } = req.query;
    const where = {};

    if (month && month.trim() !== '') where.referenceMonth = month;
    if (unitId && unitId !== 'undefined' && unitId !== '') where.unitId = Number(unitId);

    const invoices = await prisma.invoice.findMany({
      where,
      select: { status: true, dueDate: true, totalAmount: true },
    });

    const statusCounts = { PAGA: 0, ABERTA: 0, ATRASADA: 0 };
    const dueDaysMap = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalAmount = 0;
    let totalOpenAmount = 0;
    let totalDelayedAmount = 0;
    let totalPaidAmount = 0;

    invoices.forEach(inv => {
      const amount = Number(inv.totalAmount?.toString()) || 0;
      totalAmount += amount;

      if (inv.status === 'PAGA') {
        statusCounts.PAGA++;
        totalPaidAmount += amount;
      } else {
        const due = new Date(inv.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due < today) {
          statusCounts.ATRASADA++;
          totalDelayedAmount += amount;
        } else {
          statusCounts.ABERTA++;
          totalOpenAmount += amount;
        }
      }

      const day = new Date(inv.dueDate).getUTCDate();
      dueDaysMap[day] = (dueDaysMap[day] || 0) + 1;
    });

    return res.json({
      totalInvoices: invoices.length,
      totalAmount,
      totalOpenAmount,
      totalDelayedAmount,
      totalPaidAmount,
      byStatus: [
        { status: 'PAGA', _count: { _all: statusCounts.PAGA } },
        { status: 'EM ABERTO', _count: { _all: statusCounts.ABERTA } },
        { status: 'ATRASADA', _count: { _all: statusCounts.ATRASADA } },
      ].filter(s => s._count._all > 0),
      dueDays: Object.entries(dueDaysMap)
        .map(([day, count]) => ({ day: Number(day), count }))
        .sort((a, b) => a.day - b.day),
    });
  } catch (err) {
    console.error('[invoices] getDashboard:', err);
    return res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
};

exports.sendInvoicesEmail = async (req, res) => {
  try {
    const { invoiceIds, to, subject } = req.body;

    if (!invoiceIds?.length || !to) {
      return res.status(400).json({ error: 'Faturas e destinatário são obrigatórios.' });
    }

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds.map(Number) } },
      include: { company: true, unit: true, service: true },
    });

    if (!invoices.length) return res.status(404).json({ error: 'Nenhuma fatura encontrada.' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const attachments = invoices
      .map(inv => {
        // Resolve o caminho a partir da raiz do projeto (backend/)
        const fullPath = path.resolve(process.cwd(), inv.pdfPath);
        if (fs.existsSync(fullPath)) {
          return { filename: path.basename(fullPath), path: fullPath };
        }
        console.warn(`[email] PDF não encontrado no caminho: ${fullPath}`);
        return null;
      })
      .filter(Boolean);

    const formatSvc = (inv) => {
      const name = inv.service?.name || inv.serviceName || 'Não identificado';
      const contract = inv.service?.contractNumber ? ` (${inv.service.contractNumber})` : '';
      return `${name}${contract}`;
    };

    const body = `Relatório de faturas enviadas via CRM SOBEI:\n\n` +
      invoices.map(i => {
        const line = `- ${i.company.name} | Unidade: ${i.unit?.name || '-'} | Serviço: ${formatSvc(i)} | Vencimento: ${new Date(i.dueDate).toLocaleDateString()} | Valor: R$ ${Number(i.totalAmount).toFixed(2)}`;
        return line;
      }).join('\n') + `\n\nTotal de faturas: ${invoices.length}`;

    // Log para diagnóstico (apenas no console do servidor)
    const host = process.env.SMTP_HOST;
    console.log(`[email] Iniciando envio para ${to} via ${host}...`);

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: subject || 'Faturas Vivo Empresas',
        text: body,
        attachments,
      });
      console.log(`[email] SUCESSO: E-mail enviado para ${to}`);
    } catch (mailError) {
      console.error(`[email] ERRO SMTP (${host}):`, mailError.message);
      throw mailError; // Repassa para o catch principal
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[invoices] sendEmail:', err);
    return res.status(500).json({ error: 'Erro ao enviar e-mail.', details: err.message });
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });

    if (invoice.pdfPath) {
      const fullPath = path.join(__dirname, '..', '..', invoice.pdfPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await prisma.invoice.delete({ where: { id: Number(id) } });
    return res.json({ success: true });
  } catch (err) {
    console.error('[invoices] deleteInvoice:', err);
    return res.status(500).json({ error: 'Erro ao excluir fatura.' });
  }
};

exports.updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PAGA', 'ABERTA'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const updated = await prisma.invoice.update({
      where: { id: Number(id) },
      data: { status },
      include: { company: true, unit: true, service: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error('[invoices] updateStatus:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
};
