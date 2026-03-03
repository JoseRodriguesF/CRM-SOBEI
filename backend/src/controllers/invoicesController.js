const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { z } = require('zod');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const extractedInvoiceSchema = z.object({
  cnpj: z.string(),
  companyName: z.string().optional().nullable(),
  unitName: z.string().optional().nullable(),
  unitCode: z.string().optional().nullable(),
  referenceMonth: z.string(),
  totalAmount: z.number(),
  dueDate: z.string(),
  status: z.enum(['PAGA', 'PENDENTE', 'ATRASADA']),
});

async function extractInvoiceDataFromPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(buffer);

  const prompt = `
Você é um assistente que extrai dados de faturas da operadora Vivo Empresarial em PDFs.
Com base no texto abaixo, retorne APENAS um JSON válido, sem comentários, seguindo exatamente este formato:
{
  "cnpj": "string",
  "companyName": "string ou null",
  "unitName": "string ou null",
  "unitCode": "string ou null",
  "referenceMonth": "MM/AAAA",
  "totalAmount": 1234.56,
  "dueDate": "AAAA-MM-DD",
  "status": "PAGA" | "PENDENTE" | "ATRASADA"
}

Se algum dado não existir, use null.

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

exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo PDF é obrigatório.' });
    }

    const pdfPath = req.file.path;

    const data = await extractInvoiceDataFromPdf(pdfPath);

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

    let unit = null;
    if (data.unitName || data.unitCode) {
      unit = await prisma.unit.create({
        data: {
          name: data.unitName || data.unitCode || 'Unidade',
          code: data.unitCode || data.unitName || 'UNIDADE',
          companyId: company.id,
        },
      });
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        unitId: unit ? unit.id : null,
        cnpj: data.cnpj,
        referenceMonth: data.referenceMonth,
        totalAmount: data.totalAmount,
        dueDate: new Date(data.dueDate),
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
    console.error(err);
    return res.status(500).json({ error: 'Erro ao processar fatura.', details: err.message });
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
    const totalCount = await prisma.invoice.count();

    const [byStatus, totalAmount] = await Promise.all([
      prisma.invoice.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        _sum: { totalAmount: true },
      }),
    ]);

    return res.json({
      totalInvoices: totalCount,
      totalAmount: totalAmount._sum.totalAmount || 0,
      byStatus,
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
          `Empresa: ${i.company.name} | Unidade: ${i.unit?.name || '-'} | Mês: ${i.referenceMonth} | Valor: R$ ${
            i.totalAmount
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

