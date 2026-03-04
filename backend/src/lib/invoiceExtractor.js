const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { z } = require('zod');
const OpenAI = require('openai');
const prisma = require('./prisma');
const { normalizeCnpj, parseCnpjs, contractsOverlap } = require('./cnpjUtils');

// ─── OpenAI Client ───────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
    console.warn('[IA] OPENAI_API_KEY não definido. Extração por IA será desativada.');
}

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// ─── Schema de validação ─────────────────────────────────────────────────────

const extractedInvoiceSchema = z.object({
    cnpj: z.string(),
    companyName: z.string().optional().nullable(),
    unitCnpj: z.string().optional().nullable(),
    unitAddress: z.string().optional().nullable(),
    contractNumber: z.string().optional().nullable(),
    referenceMonth: z.string(),
    totalAmount: z.number(),
    dueDate: z.string(),
    service: z.string().optional().nullable(),
    status: z.enum(['PAGA', 'ABERTA']),
});

// ─── Extração de PDF ─────────────────────────────────────────────────────────

const PDF_PROMPT = (text) => `
Você é um assistente que extrai dados de faturas da operadora Vivo Empresarial em PDFs.
Com base no texto abaixo, retorne APENAS um JSON válido, sem comentários, seguindo exatamente este formato:
{
  "cnpj": "string (CNPJ da empresa/matriz que aparece na fatura)",
  "companyName": "string ou null (nome da empresa/matriz)",
  "unitCnpj": "string ou null (CNPJ específico da unidade/filial, se diferente do CNPJ da matriz)",
  "unitAddress": "string ou null (endereço completo da unidade/filial mencionado na fatura)",
  "contractNumber": "string ou null (número(s) do contrato associado ao serviço desta fatura)",
  "referenceMonth": "MM/AAAA",
  "totalAmount": 1234.56,
  "dueDate": "AAAA-MM-DD",
  "service": "string ou null (tipo de serviço: Ex: Móvel, Dados, Internet, Fixo)",
  "status": "PAGA" | "ABERTA"
}

Regras importantes:
- "cnpj" é o CNPJ principal/matriz da fatura.
- "unitCnpj" é o CNPJ da filial/unidade, se existir e for diferente do principal. Se não houver, use null.
- "unitAddress" é o endereço completo da unidade ou filial. Normalize (sem abreviações, em maiúsculas).
- "contractNumber" contém os números ou identificadores dos contratos associados a ESTE serviço/fatura.
- "service": tipo de serviço principal (ex: Móvel, Fibra, Fixo).
- "dueDate": data de vencimento EXATA como escrita na fatura.
- "status": use "PAGA" se indicar pagamento confirmado (ex: "AUTODEBITO", "FATURA PAGA"). Caso contrário, "ABERTA".
- Se algum dado não existir, use null.

Texto da fatura:
"""${text.slice(0, 12000)}"""
`;

/**
 * Extrai dados estruturados de um arquivo PDF de fatura via OpenAI.
 * @param {string} filePath Caminho absoluto do PDF
 * @returns {Promise<z.infer<typeof extractedInvoiceSchema>>}
 */
async function extractInvoiceDataFromPdf(filePath) {
    if (!openai) throw new Error('OPENAI_API_KEY não configurado no backend.');

    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const pdfData = await parser.getText();

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: 'Você é um assistente especializado em extrair dados estruturados de faturas em português do Brasil.',
            },
            { role: 'user', content: PDF_PROMPT(pdfData.text) },
        ],
        response_format: { type: 'json_object' },
    });

    const raw = JSON.parse(completion.choices[0].message.content);

    return extractedInvoiceSchema.parse({
        ...raw,
        totalAmount:
            typeof raw.totalAmount === 'string'
                ? Number(raw.totalAmount.replace('.', '').replace(',', '.'))
                : raw.totalAmount,
    });
}

// ─── Matching de unidade/serviço ─────────────────────────────────────────────

/**
 * Calcula a pontuação de similaridade entre normalização de dois endereços.
 * Retorna 5 se há sobreposição suficiente, 0 caso contrário.
 */
function scoreAddress(invoiceAddress, unitAddress) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const addrA = normalize(invoiceAddress);
    const addrB = normalize(unitAddress);
    if (addrA.length <= 5 || addrB.length <= 5) return 0;

    const longer = addrA.length > addrB.length ? addrA : addrB;
    const shorter = addrA.length > addrB.length ? addrB : addrA;
    return longer.includes(shorter.slice(0, Math.min(shorter.length, 20))) ? 5 : 0;
}

/**
 * Calcula a pontuação de similaridade do nome do serviço entre PDF e cadastro.
 */
function scoreServiceName(pdfServiceName, registeredServiceName) {
    if (!pdfServiceName || !registeredServiceName) return 0;
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = normalize(pdfServiceName);
    const b = normalize(registeredServiceName);
    return a.includes(b) || b.includes(a) ? 4 : 0;
}

/**
 * Tenta encontrar a unidade e o serviço cadastrados que melhor correspondem
 * aos dados extraídos da fatura.
 *
 * Pontuação:
 * - Número de contrato (via Service)  → 10 pts (match forte — determinístico)
 * - Nome do serviço                   → +4 pts (bônus)
 * - CNPJ da unidade                   → 10 pts (match forte)
 * - Endereço da unidade               → 5 pts
 * Score mínimo para aceitar: 5
 *
 * @param {number} companyId
 * @param {{ unitCnpj?, unitAddress?, contractNumber?, service? }} data
 * @returns {Promise<{ unit: object|null, service: object|null }>}
 */
async function matchUnitAndService(companyId, data) {
    const { unitCnpj, unitAddress, contractNumber, service: pdfServiceName } = data;

    const units = await prisma.unit.findMany({
        where: { companyId },
        include: { services: true },
    });

    if (!units.length) return { unit: null, service: null };

    let best = { unit: null, service: null, score: 0 };

    for (const unit of units) {
        const unitCnpjs = parseCnpjs(unit.cnpjs);

        // ── 1. Match por número de contrato (via serviços) ───────────────────
        if (contractNumber) {
            for (const svc of unit.services) {
                if (!contractsOverlap(contractNumber, svc.contractNumber)) continue;

                const score = 10 + scoreServiceName(pdfServiceName, svc.name);
                if (score > best.score) best = { unit, service: svc, score };
            }
        }

        // ── 2. Match por CNPJ da unidade ────────────────────────────────────
        if (unitCnpj && unitCnpjs.length > 0) {
            const normalizedInput = normalizeCnpj(unitCnpj);
            const cnpjHit = unitCnpjs.some((c) => normalizeCnpj(c) === normalizedInput);

            if (cnpjHit) {
                // Tenta encontrar o serviço por nome
                const matchedSvc = pdfServiceName
                    ? unit.services.find((s) => scoreServiceName(pdfServiceName, s.name) > 0) ?? null
                    : null;

                const score = 10 + (matchedSvc ? 3 : 0);
                if (score > best.score) best = { unit, service: matchedSvc, score };
            }
        }

        // ── 3. Match por endereço ────────────────────────────────────────────
        if (unitAddress && unit.address) {
            const score = scoreAddress(unitAddress, unit.address);
            if (score > best.score) best = { unit, service: null, score };
        }
    }

    return best.score >= 5 ? { unit: best.unit, service: best.service } : { unit: null, service: null };
}

module.exports = { extractInvoiceDataFromPdf, matchUnitAndService };
