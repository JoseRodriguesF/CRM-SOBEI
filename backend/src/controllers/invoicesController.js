const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { z } = require('zod');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

if (!process.env.OPENAI_API_KEY) {
  console.warn('[IA] OPENAI_API_KEY não definido no backend. Extração por IA será desativada.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  : null;

const extractedInvoiceSchema = z.object({
  cnpj: z.string(),
  companyName: z.string().optional().nullable(),
  unitCnpj: z.string().optional().nullable(),
  unitAddress: z.string().optional().nullable(),
  unitContracts: z.string().optional().nullable(),
  referenceMonth: z.string(),
  totalAmount: z.number(),
  dueDate: z.string(),
  status: z.enum(['PAGA', 'PENDENTE', 'ATRASADA']),
});

async function extractInvoiceDataFromPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const pdfData = await parser.getText();

  if (!openai) {
    throw new Error('OPENAI_API_KEY não configurado no backend.');
  }

  const prompt = `
Você é um assistente que extrai dados de faturas da operadora Vivo Empresarial em PDFs.
Com base no texto abaixo, retorne APENAS um JSON válido, sem comentários, seguindo exatamente este formato:
{
  "cnpj": "string (CNPJ da empresa/matriz que aparece na fatura)",
  "companyName": "string ou null (nome da empresa/matriz)",
  "unitCnpj": "string ou null (CNPJ específico da unidade/filial, se diferente do CNPJ da matriz)",
  "unitAddress": "string ou null (endereço completo da unidade/filial mencionado na fatura)",
  "unitContracts": "string ou null (resumo dos contratos/números de contrato da unidade, ex: 'Contrato móvel 123, dados 456')",
  "referenceMonth": "MM/AAAA",
  "totalAmount": 1234.56,
  "dueDate": "AAAA-MM-DD",
  "status": "PAGA" | "PENDENTE" | "ATRASADA"
}

Regras importantes:
- "cnpj" é o CNPJ principal/matriz da fatura
- "unitCnpj" é o CNPJ da filial/unidade, se existir e for diferente do CNPJ principal. Se não houver, use null.
- "unitAddress" é o endereço completo da unidade ou filial mencionada na fatura. Normalize o endereço (sem abreviações, em maiúsculas).
- "unitContracts" deve conter os números ou identificadores dos contratos associados à unidade.
- Se algum dado não existir, use null.

Texto da fatura:
"""${pdfData.text.slice(0, 12000)}"""
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Você é um assistente especializado em extrair dados estruturados de faturas em português do Brasil.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0].message.content;
  const parsed = JSON.parse(raw);

  const validated = extractedInvoiceSchema.parse({
    ...parsed,
    totalAmount: typeof parsed.totalAmount === 'string' ? Number(parsed.totalAmount.replace('.', '').replace(',', '.')) : parsed.totalAmount,
  });

  return validated;
}

/**
 * Tenta encontrar uma unidade já cadastrada no banco que corresponda
 * aos dados extraídos da fatura (CNPJ da unidade, endereço, contratos).
 * NÃO usa o nome da unidade — usa apenas dados extraídos do conteúdo da fatura.
 */
async function matchUnitFromInvoiceData(companyId, data) {
  const { unitCnpj, unitAddress, unitContracts } = data;

  // Busca todas as unidades da empresa
  const units = await prisma.unit.findMany({
    where: { companyId },
  });

  if (!units.length) return null;

  for (const unit of units) {
    let score = 0;

    // Comparação por CNPJ da unidade (match forte)
    if (unitCnpj && unit.cnpj) {
      const normalizedFaturaCnpj = unitCnpj.replace(/\D/g, '');
      const normalizedUnitCnpj = unit.cnpj.replace(/\D/g, '');
      if (normalizedFaturaCnpj && normalizedUnitCnpj && normalizedFaturaCnpj === normalizedUnitCnpj) {
        score += 10; // CNPJ é match forte o suficiente por si só
      }
    }

    // Comparação por endereço (match moderado)
    if (unitAddress && unit.address) {
      const normalizeAddr = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const addrFatura = normalizeAddr(unitAddress);
      const addrUnit = normalizeAddr(unit.address);
      if (addrFatura.length > 5 && addrUnit.length > 5) {
        // Verifica se há sobreposição significativa
        const longer = addrFatura.length > addrUnit.length ? addrFatura : addrUnit;
        const shorter = addrFatura.length > addrUnit.length ? addrUnit : addrFatura;
        if (longer.includes(shorter.slice(0, Math.min(shorter.length, 20)))) {
          score += 5;
        }
      }
    }

    // Comparação por contratos (match moderado)
    if (unitContracts && unit.contracts) {
      // Extrai números dos contratos e verifica interseção
      const extractNumbers = (s) => s.match(/\d{4,}/g) || [];
      const numsFatura = extractNumbers(unitContracts);
      const numsUnit = extractNumbers(unit.contracts);
      const hasCommonNumber = numsFatura.some((n) => numsUnit.includes(n));
      if (hasCommonNumber) {
        score += 6;
      }
    }

    // Score mínimo para considerar como match
    if (score >= 5) {
      return unit;
    }
  }

  return null;
}

exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo PDF é obrigatório.' });
    }

    const pdfPath = req.file.path;
    const data = await extractInvoiceDataFromPdf(pdfPath);

    // 1. Encontra ou cria a empresa (matriz) pelo CNPJ principal
    let company = await prisma.company.findUnique({
      where: { cnpj: data.cnpj },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          cnpj: data.cnpj,
          name: data.companyName || `Empresa ${data.cnpj}`,
        },
      });
    }

    // 2. Tenta fazer match com unidade já cadastrada
    //    usando CNPJ da unidade, endereço e contratos extraídos da fatura.
    //    NÃO cria unidade automaticamente — apenas vincula se encontrar match.
    let unit = null;
    const hasUnitSignals = data.unitCnpj || data.unitAddress || data.unitContracts;

    if (hasUnitSignals) {
      unit = await matchUnitFromInvoiceData(company.id, data);

      if (unit) {
        console.log(`[IA] Fatura vinculada à unidade cadastrada: "${unit.name}" (id=${unit.id})`);
      } else {
        console.log('[IA] Nenhuma unidade cadastrada corresponde aos dados da fatura. Salvando sem unidade vinculada.');
      }
    }

    // 3. Cria a fatura (com ou sem unidade vinculada)
    const invoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        unitId: unit ? unit.id : null,
        cnpj: data.cnpj,
        referenceMonth: data.referenceMonth,
        totalAmount: data.totalAmount,
        dueDate: new Date(data.dueDate + 'T00:00:00Z'),
        status: data.status,
        pdfPath: path.relative(path.join(__dirname, '..', '..'), pdfPath).replace(/\\/g, '/'),
      },
      include: {
        company: true,
        unit: true,
      },
    });

    return res.status(201).json(invoice);
  } catch (err) {
    console.error('Erro ao processar fatura:', err);
    return res
      .status(500)
      .json({ error: 'Erro ao processar fatura.', details: err.message });
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const { cnpj, status, month, unitId } = req.query;

    const where = {};

    if (cnpj) {
      where.cnpj = cnpj;
    }
    if (status) {
      where.status = status;
    }
    if (unitId) {
      where.unitId = Number(unitId);
    }
    if (month) {
      where.referenceMonth = month;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        company: true,
        unit: true,
      },
      orderBy: {
        dueDate: 'desc',
      },
    });

    return res.json(invoices);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar faturas.' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const { month, unitId } = req.query;
    const where = {};

    if (month) where.referenceMonth = month;
    if (unitId) where.unitId = Number(unitId);

    // Get basic stats with filters
    const totalCount = await prisma.invoice.count({ where });

    // Status counts
    const byStatus = await prisma.invoice.groupBy({
      by: ['status'],
      where: { ...where },
      _count: { _all: true },
    });

    // Total values (Total overall vs Total Open)
    const [totalAggregate, openAggregate] = await Promise.all([
      prisma.invoice.aggregate({
        where: { ...where },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...where,
          status: { in: ['PENDENTE', 'ATRASADA'] }
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // Group by Due Day for the expiration card
    // Since prisma doesn't support complex date extractions in groupBy easily for SQLite/Postgres across types without raw SQL,
    // and we already have referenceMonth/dueDate, we can fetch the invoices for the current filters and group in memory if the result set is small,
    // or use a more efficient approach. For simplicity and robustness:
    const filteredInvoices = await prisma.invoice.findMany({
      where: { ...where },
      select: { dueDate: true },
    });

    const dueDaysMap = {};
    filteredInvoices.forEach(inv => {
      // Use UTC date to ensure we get the intended day regardless of server timezone
      const day = new Date(inv.dueDate).getUTCDate();
      dueDaysMap[day] = (dueDaysMap[day] || 0) + 1;
    });

    const dueDays = Object.entries(dueDaysMap)
      .map(([day, count]) => ({ day: Number(day), count }))
      .sort((a, b) => a.day - b.day);

    return res.json({
      totalInvoices: totalCount,
      totalAmount: totalAggregate._sum.totalAmount || 0,
      totalOpenAmount: openAggregate._sum.totalAmount || 0,
      byStatus,
      dueDays,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
};

exports.sendInvoicesEmail = async (req, res) => {
  try {
    const { invoiceIds, to, subject } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || !invoiceIds.length) {
      return res.status(400).json({ error: 'Lista de faturas é obrigatória.' });
    }

    if (!to) {
      return res.status(400).json({ error: 'Destinatário é obrigatório.' });
    }

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds.map(Number) } },
      include: { company: true, unit: true },
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const attachments = invoices.map((inv) => {
      const fullPath = path.join(__dirname, '..', '..', inv.pdfPath);
      return {
        filename: path.basename(fullPath),
        path: fullPath,
      };
    });

    const pendentes = invoices.filter((i) => i.status === 'PENDENTE' || i.status === 'ATRASADA');

    const textLines = [
      'Relatório consolidado de faturas:',
      '',
      ...invoices.map(
        (i) =>
          `Empresa: ${i.company.name} | Unidade: ${i.unit?.name || '-'} | Mês: ${i.referenceMonth} | Valor: R$ ${i.totalAmount
          } | Status: ${i.status}`,
      ),
      '',
      'Faturas pendentes/atrasadas:',
      ...pendentes.map(
        (i) => `- ${i.company.name} | ${i.unit?.name || '-'} | ${i.referenceMonth} | R$ ${i.totalAmount}`,
      ),
    ];

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: subject || 'Faturas Vivo Empresas',
      text: textLines.join('\n'),
      attachments,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao enviar e-mail.', details: err.message });
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) {
      return res.status(404).json({ error: 'Fatura não encontrada.' });
    }

    // Remove arquivo PDF do disco se existir
    if (invoice.pdfPath) {
      const fullPath = path.join(__dirname, '..', '..', invoice.pdfPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await prisma.invoice.delete({ where: { id: Number(id) } });

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir fatura:', err);
    return res.status(500).json({ error: 'Erro ao excluir fatura.', details: err.message });
  }
};

exports.updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PAGA', 'PENDENTE', 'ATRASADA'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}.` });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) {
      return res.status(404).json({ error: 'Fatura não encontrada.' });
    }

    const updated = await prisma.invoice.update({
      where: { id: Number(id) },
      data: { status },
      include: { company: true, unit: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error('Erro ao atualizar status da fatura:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status.', details: err.message });
  }
};
