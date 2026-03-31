const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const prisma = require('../lib/prisma');
const { extractInvoiceDataWithContext, localDoubleCheckMatch } = require('../lib/invoiceExtractor');
const { normalizeCnpj, parseCnpjs } = require('../lib/cnpjUtils');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sanitiza uma string para uso seguro em nomes de arquivo. */
const sanitizeFilename = (str) =>
  str ? str.toString().replace(/[^a-z0-9]/gi, '_').substring(0, 50) : '_';

/** Formata os detalhes de um serviço de fatura para o corpo do e-mail. */
const formatServiceDetail = (inv) => {
  const name = inv.service?.name || inv.serviceName || 'Não identificado';
  const contract = inv.service?.contractNumber ? ` (${inv.service.contractNumber})` : '';
  return `${name}${contract}`;
};

// ─── Controller Actions ───────────────────────────────────────────────────────

exports.uploadInvoice = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo PDF é obrigatório.' });
  }

  const pdfPath = req.file.path;

  try {
    // 1. Busca todas as unidades e serviços para contexto da IA
    const units = await prisma.unit.findMany({ include: { services: true } });

    // 2. Extração via IA com contexto das unidades
    const { data, rawAiOutput } = await extractInvoiceDataWithContext(pdfPath, units);

    // 2.5 Validação de dados mínimos obrigatórios
    if (!data.referenceMonth || !data.totalAmount || !data.dueDate) {
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      return res.status(400).json({
        error: 'Não foi possível extrair dados essenciais (Mês, Valor ou Vencimento) desta fatura. Verifique se o PDF é uma fatura válida.',
        missingFields: {
          referenceMonth: !data.referenceMonth,
          totalAmount: !data.totalAmount,
          dueDate: !data.dueDate
        }
      });
    }

    // 3. Double-check local do match (valida/corrige o que a IA retornou)
    const match = localDoubleCheckMatch(data, units);

    if (!match.unit) {
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      return res.status(400).json({
        error: 'Esta fatura não corresponde a nenhuma unidade cadastrada. Cadastre sua Unidade no painel antes de fazer upload de faturas.',
        debug: match.debug,
      });
    }

    const { id: unitId, name: unitName, companyId } = match.unit;
    const serviceId = match.service?.id ?? null;
    const svcName = match.service?.name ?? data.service ?? 'Sem_Servico';
    const phone = data.phoneNumber ?? 'Sem_Telefone';

    console.log(`[IA] Match: Unidade "${unitName}"${match.service ? ` / Serviço "${match.service.name}"` : ''} (${match.debug?.source})`);

    // 4. Determinação do CNPJ final (Regra de Unidade Majoritária)
    // Prioridade 1: CNPJ literal extraído pela IA da fatura
    let finalCnpj = data.cnpj;

    // Prioridade 2: Se não houver CNPJ literal, usamos o CNPJ da Unidade que a lógica local encontrou (Match por Contrato/Endereço)
    if (!finalCnpj || finalCnpj.trim() === '') {
      const { SOBEI_MATRIZ_CNPJ } = require('../config/constants');
      const unitCnpjs = parseCnpjs(match.unit?.cnpjs);
      
      if (unitCnpjs.length > 0) {
        finalCnpj = unitCnpjs[0]; 
        console.log(`[invoices] CNPJ não encontrado na fatura. Usando CNPJ da Unidade encontrada: ${finalCnpj}`);
      } else {
        // Fallback final: Matriz (Garante que o campo obrigatório no DB seja preenchido)
        finalCnpj = SOBEI_MATRIZ_CNPJ;
        console.log(`[invoices] CNPJ não encontrado e Unidade sem CNPJ. Usando Fallback Matriz: ${finalCnpj}`);
      }
    }

    // 5. Renomeia o PDF para nome amigável
    const newFileName = `${sanitizeFilename(unitName)}-${sanitizeFilename(svcName)}-${sanitizeFilename(phone)}-${Date.now()}.pdf`;
    const newPath = path.join(path.dirname(pdfPath), newFileName);

    let finalPdfPath = pdfPath;
    try {
      fs.renameSync(pdfPath, newPath);
      finalPdfPath = newPath;
    } catch (renameErr) {
      console.error('[invoices] Erro ao renomear arquivo:', renameErr);
    }

    // 5. Persiste a fatura
    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        unitId,
        serviceId,
        cnpj: finalCnpj,
        referenceMonth: data.referenceMonth,
        totalAmount: data.totalAmount,
        dueDate: new Date(data.dueDate + 'T12:00:00'),
        status: data.status,
        serviceName: data.contractNumber
          ? `[CONTRATO: ${data.contractNumber}] ${data.service ?? 'VIVO'}`
          : (data.service ?? 'VIVO'),
        pdfPath: path.relative(path.join(__dirname, '..', '..'), finalPdfPath).replace(/\\/g, '/'),
      },
      include: { company: true, unit: true, service: true },
    });

    return res.status(201).json({ ...invoice, contractNumber: data.contractNumber, debug: match.debug });
  } catch (err) {
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    console.error('[invoices] uploadInvoice:', err);
    return res.status(500).json({ error: 'Erro ao processar fatura.', details: err.message });
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const { cnpj, status, month, unitId, service } = req.query;
    const where = {};

    if (cnpj?.trim()) where.cnpj = cnpj;
    if (month?.trim()) where.referenceMonth = month;
    if (unitId && unitId !== 'undefined' && unitId !== '') where.unitId = Number(unitId);
    if (service?.trim()) where.serviceName = { contains: service, mode: 'insensitive' };

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

    if (month?.trim()) where.referenceMonth = month;
    if (unitId && unitId !== 'undefined' && unitId !== '') where.unitId = Number(unitId);

    const invoices = await prisma.invoice.findMany({
      where,
      include: { unit: true, service: true },
      orderBy: { dueDate: 'desc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mismatchedCnpjs = [];
    const unregisteredServices = [];
    const solucionaInvoices = [];
    const seenServiceIds = new Set();

    const statusCounts = { PAGA: 0, ABERTA: 0, ATRASADA: 0 };
    const dueDaysMap = {};
    let totalAmount = 0;
    let totalOpenAmount = 0;
    let totalDelayedAmount = 0;
    let totalPaidAmount = 0;

    for (const inv of invoices) {
      const amount = Number(inv.totalAmount?.toString()) || 0;
      totalAmount += amount;

      // Check for Soluciona TI (Hardware Rental)
      const serviceText = (inv.serviceName || inv.service?.name || '').toUpperCase();
      if (serviceText.includes('SOLUCIONA TI')) {
        solucionaInvoices.push({
          id: inv.id,
          unitName: inv.unit?.name || 'Não id.',
          serviceName: inv.serviceName,
          referenceMonth: inv.referenceMonth,
          amount: amount
        });
      }

      // Check CNPJ mismatch
      if (inv.unit && inv.cnpj) {
        const { parseCnpjs, normalizeCnpj } = require('../lib/cnpjUtils');
        const unitCnpjs = parseCnpjs(inv.unit.cnpjs).map(normalizeCnpj);
        const invCnpj = normalizeCnpj(inv.cnpj);
        if (unitCnpjs.length > 0 && !unitCnpjs.includes(invCnpj)) {
          mismatchedCnpjs.push({
            id: inv.id,
            cnpj: inv.cnpj,
            unitName: inv.unit.name,
            expected: unitCnpjs.join(', '),
            referenceMonth: inv.referenceMonth
          });
        }
      }

      // Track registered services
      if (inv.serviceId) {
        seenServiceIds.add(inv.serviceId);
      } else {
        // Unregistered service tracking
        unregisteredServices.push({
          id: inv.id,
          name: inv.serviceName || 'Vivo',
          unitName: inv.unit?.name || 'Não id.',
          referenceMonth: inv.referenceMonth
        });
      }

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
    }

    // Identify missing services (Active contracts without invoices in this period)
    const allUnits = await prisma.unit.findMany({ include: { services: true } });
    const missingServices = [];
    if (month) {
      for (const u of allUnits) {
        // If filtering by unit, only check that unit
        if (unitId && u.id !== Number(unitId)) continue;

        for (const s of u.services) {
          if (!seenServiceIds.has(s.id)) {
            missingServices.push({
              id: s.id,
              name: s.name,
              contract: s.contractNumber,
              unitName: u.name
            });
          }
        }
      }
    }

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
      analysis: {
        mismatchedCnpjs,
        unregisteredServices,
        missingServices,
        solucionaInvoices
      }
    });
  } catch (err) {
    console.error('[invoices] getDashboard:', err);
    return res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
};


exports.deleteInvoice = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoice = await prisma.invoice.findUnique({ where: { id } });

    if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });

    if (invoice.pdfPath) {
      const fullPath = path.join(__dirname, '..', '..', invoice.pdfPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await prisma.invoice.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('[invoices] deleteInvoice:', err);
    return res.status(500).json({ error: 'Erro ao excluir fatura.' });
  }
};

exports.updateInvoiceStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, paidDate } = req.body;

    if (!['PAGA', 'ABERTA'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const data = { status };
    if (status === 'PAGA') {
      data.paidDate = paidDate ? new Date(paidDate) : new Date();
    } else {
      data.paidDate = null;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data,
      include: { company: true, unit: true, service: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error('[invoices] updateStatus:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
};

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
