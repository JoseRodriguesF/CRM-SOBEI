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
    phoneNumber: z.string().optional().nullable(),
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
  "phoneNumber": "string ou null (número de telefone principal registrado na fatura, se houver)",
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
    if (!invoiceAddress || !unitAddress) return 0;
    const normalize = (s) => s.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/rua|avenida|av|praca|viela|alameda|rodovia|rod|travessa|trv/g, '');

    const addrA = normalize(invoiceAddress);
    const addrB = normalize(unitAddress);

    if (addrA.length <= 5 || addrB.length <= 5) return 0;

    // Correspondência EXATA após normalização
    if (addrA === addrB) return 25;

    // Correspondência FORTE (uma contém a outra)
    if (addrA.includes(addrB) || addrB.includes(addrA)) return 20;

    const shorter = addrA.length > addrB.length ? addrB : addrA;
    const longer = addrA.length > addrB.length ? addrA : addrB;

    // Se coincidir pelo menos 15 caracteres ou 70% da string (o que for menor)
    const minMatch = Math.min(15, Math.floor(shorter.length * 0.7));
    if (longer.includes(shorter.slice(0, minMatch))) return 12;

    return 0;
}

/**
 * Calcula a pontuação de similaridade do nome do serviço entre PDF e cadastro.
 */
function scoreServiceName(pdfServiceName, registeredServiceName) {
    if (!pdfServiceName || !registeredServiceName) return 0;
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = normalize(pdfServiceName);
    const b = normalize(registeredServiceName);
    if (a === b) return 8;
    return a.includes(b) || b.includes(a) ? 5 : 0;
}

/**
 * Tenta encontrar a unidade e o serviço cadastrados que melhor correspondem
 * aos dados extraídos da fatura com lógica avançada de desempate.
 *
 * @param {number} companyId
 * @param {{ cnpj, unitCnpj?, unitAddress?, contractNumber?, service? }} data
 * @returns {Promise<{ unit: object|null, service: object|null }>}
 */
async function matchUnitAndService(companyId, data) {
    const { cnpj: mainCnpj, unitCnpj, unitAddress, contractNumber, service: pdfServiceName } = data;

    const units = await prisma.unit.findMany({
        where: { companyId },
        include: { services: true },
    });

    if (!units.length) return { unit: null, service: null };

    const normMain = normalizeCnpj(mainCnpj);
    const normUnit = unitCnpj ? normalizeCnpj(unitCnpj) : null;

    // Mapeamento de possíveis matches para avaliação refinada
    const candidates = [];

    for (const unit of units) {
        let score = 0;
        let matchedSvc = null;
        let detail = {
            cnpjMatch: false,
            unitCnpjMatch: false,
            addressMatch: 0,
            contractMatch: false,
            serviceMatch: 0
        };

        // ── 1. Match por CNPJs ───────────────────────────────────────────────
        const unitCnpjs = parseCnpjs(unit.cnpjs).map(normalizeCnpj);

        // Match com o CNPJ específico da unidade extraído do PDF (Sinal fortíssimo)
        if (normUnit && unitCnpjs.includes(normUnit)) {
            score += 20;
            detail.unitCnpjMatch = true;
        }
        // Match com o CNPJ principal da fatura (Sinal comum de faturamento centralizado)
        else if (unitCnpjs.includes(normMain)) {
            score += 8;
            detail.cnpjMatch = true;
        }

        // ── 2. Match por Endereço ───────────────────────────────────────────
        if (unitAddress && unit.address) {
            const addrScore = scoreAddress(unitAddress, unit.address);
            score += addrScore;
            detail.addressMatch = addrScore;
        }

        // ── 3. Match por Contrato / Serviço ─────────────────────────────────
        if (contractNumber || pdfServiceName) {
            let bestSvcScore = 0;
            let tempMatchedSvc = null;

            for (const svc of unit.services) {
                let sScore = 0;
                let cHit = false;

                if (contractNumber && contractsOverlap(contractNumber, svc.contractNumber)) {
                    sScore += 25; // Contrato é o sinal mais específico da Vivo
                    cHit = true;
                }

                const sNameScore = scoreServiceName(pdfServiceName, svc.name);
                sScore += sNameScore;

                if (sScore > bestSvcScore) {
                    bestSvcScore = sScore;
                    tempMatchedSvc = svc;
                    detail.contractMatch = cHit;
                    detail.serviceMatch = sNameScore;
                }
            }

            score += bestSvcScore;
            matchedSvc = tempMatchedSvc;
        }

        // Bônus de "Gold Standard": Se bater Endereço E (CNPJ da Unidade ou Contrato)
        if (detail.addressMatch >= 12 && (detail.unitCnpjMatch || detail.contractMatch)) {
            score += 15;
        }

        candidates.push({ unit, service: matchedSvc, score, detail });
    }

    // Ordenação com Critérios de Desempate Hierárquicos:
    // 1. Maior Score Total
    // 2. Desempate: Quem teve match de CONTRATO (Sinal mais proprietário e único)
    // 3. Desempate: Quem teve match de CNPJ ESPECÍFICO da Unidade
    // 4. Desempate: Quem teve maior score de Endereço
    // 5. Desempate: Se tudo falhar, maior score de nome do Serviço
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.detail.contractMatch !== a.detail.contractMatch) return b.detail.contractMatch ? 1 : -1;
        if (b.detail.unitCnpjMatch !== a.detail.unitCnpjMatch) return b.detail.unitCnpjMatch ? 1 : -1;
        if (b.detail.addressMatch !== a.detail.addressMatch) return b.detail.addressMatch - a.detail.addressMatch;
        return b.detail.serviceMatch - a.detail.serviceMatch;
    });

    const best = candidates[0];

    // Logging para monitoramento de decisões da IA
    if (best && best.score >= 5) {
        if (candidates.length > 1 && candidates[1].score >= best.score - 2) {
            console.log(`[IA-Match] Desempate aplicado: "${best.unit.name}" venceu "${candidates[1].unit.name}" nos critérios de detalhe.`);
        }
        return { unit: best.unit, service: best.service };
    }

    return { unit: null, service: null };
}

module.exports = { extractInvoiceDataFromPdf, matchUnitAndService };
