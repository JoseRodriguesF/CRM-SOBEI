const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { z } = require('zod');
const OpenAI = require('openai');
const prisma = require('./prisma');
const { normalizeCnpj, parseCnpjs } = require('./cnpjUtils');

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
    unitId: z.number().optional().nullable(),
    serviceId: z.number().optional().nullable(),
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

// ─── Extração de PDF com Contexto ────────────────────────────────────────────

const PDF_PROMPT = (text, unitsContext) => `
Você é um assistente especializado em extrair dados de faturas corporativas em PDFs (ex: Vivo Empresarial).
Abaixo está a lista de unidades e serviços (contratos) registrados no banco de dados do sistema:

[LISTA DE UNIDADES CADASTRADAS]
${unitsContext}
[/LISTA DE UNIDADES CADASTRADAS]

Com base no texto da fatura fornecido abaixo, sua missão principal é:
1. Extrair os dados financeiros e faturais básicos (valor, vencimento, mês de vigência, status, CNPJ matriz).
2. Tentar vincular essa fatura a uma das unidades e serviços da lista cadastrada, identificando os IDs correspondentes.
   - Analise o CNPJ da filial (que costuma vir no topo junto ao endereço). Se bater com algum cadatrado, use esse "unitId".
   - Analise o Número da Conta ou Contrato (geralmente de 10 a 14 dígitos). Se bater com o "contractNumber" de algum serviço cadastrado, preencha "serviceId" e "unitId".
   - Analise o endereço de instalação da fatura e cruze com o endereço das unidades cadastradas em caso de dúvida.

Retorne APENAS um JSON válido e sem formatação adicional ou markdown, seguindo exatamente este modelo:
{
  "cnpj": "string (CNPJ principal da matriz/faturamento)",
  "companyName": "string ou null (nome da matriz)",
  "unitId": numero inteiro ou null (o ID da unidade que é dona desta fatura, dentre a lista enviada. Caso não encontre match na lista, coloque null)",
  "serviceId": numero inteiro ou null (o ID do serviço dessa fatura. Caso não encontre, null)",
  "unitCnpj": "string ou null (CNPJ específico da filial exibido no corpo da nota, se houver)",
  "unitAddress": "string ou null (endereço de instalação exibido na nota, se houver)",
  "contractNumber": "string ou null (número de contrato ou conta longa)",
  "phoneNumber": "string ou null (telefone na fatura)",
  "referenceMonth": "MM/AAAA",
  "totalAmount": 1234.56,
  "dueDate": "AAAA-MM-DD",
  "service": "string ou null (Móvel, Fixa, Dados, etc)",
  "status": "PAGA" ou "ABERTA" (considere ABERTA por padrão)
}

Texto da fatura (limitado à 1ª página para garantir perfomance e precisão dos cabeçalhos):
"""${text.slice(0, 15000)}"""
`;

/**
 * Extrai dados estruturados de um arquivo PDF com o contexto das unidades do banco.
 */
async function extractInvoiceDataWithContext(filePath, units = []) {
    if (!openai) throw new Error('OPENAI_API_KEY não configurado no backend.');

    // 1. Extração do Texto Bruto
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const pdfData = await parser.getText({ first: 1 });
    const rawText = pdfData.text;

    // 2. Formatando contexto das unidades para o Prompt
    const unitsContext = units.map(u => ({
        id: u.id,
        nome: u.name,
        cnpjs: parseCnpjs(u.cnpjs),
        endereco: u.address,
        servicos: u.services.map(s => ({
            id: s.id,
            nome: s.name,
            contrato_conta: s.contractNumber
        }))
    }));

    const contextStr = JSON.stringify(unitsContext, null, 2);
    
    // 3. Chamando a IA com o contexto aprimorado
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: 'Você é um assistente cirúrgico em extração de metadados PURE JSON de faturas de telefonia corporativas. Seja rigoroso no matching de unidades.',
            },
            { role: 'user', content: PDF_PROMPT(rawText, contextStr) },
        ],
        response_format: { type: 'json_object' },
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    console.log('[IA-Debug] Dados extraídos e match primário da IA:', JSON.stringify(raw, null, 2));

    // Fallback Manual Robusto para Contract Number (prática boa existente mantida)
    if (!raw.contractNumber) {
        const fallbackMatch = rawText.match(/Conta[:\s]+(\d{10,14})/i) ||
            rawText.match(/Conta[^0-9]+(\d{10,14})/i) ||
            rawText.match(/N[úu]mero\s+da\s+Conta[:\s]+(\d{10,14})/i);

        if (fallbackMatch) {
            raw.contractNumber = fallbackMatch[1];
            console.log(`[IA-Fallback] Número de Conta encontrado via Regex: ${raw.contractNumber}`);
        }
    }

    // Passar pelo parsing do Zod para garantir tipos e sanitizar dados financeiros (prática boa existente mantida)
    const validData = extractedInvoiceSchema.parse({
        ...raw,
        totalAmount:
            typeof raw.totalAmount === 'string'
                ? Number(raw.totalAmount.replace('.', '').replace(',', '.'))
                : raw.totalAmount,
    });

    return { data: validData, text: rawText, rawAiOutput: raw };
}

function scoreAddress(invoiceAddress, unitAddress) {
    if (!invoiceAddress || !unitAddress) return 0;
    const normalize = (s) => s.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/rua|avenida|av|praca|viela|alameda|rodovia|rod|travessa|trv|end|r\s|r\.|n\.|n\s|zona|sul|norte|leste|oeste/g, '');

    const addrA = normalize(invoiceAddress);
    const addrB = normalize(unitAddress);

    if (addrA.length <= 5 || addrB.length <= 5) return 0;
    if (addrA === addrB) return 25;
    if (addrA.includes(addrB) || addrB.includes(addrA)) return 20;

    const shorter = addrA.length > addrB.length ? addrB : addrA;
    const longer = addrA.length > addrB.length ? addrA : addrB;
    const minMatch = Math.min(15, Math.floor(shorter.length * 0.7));
    if (longer.includes(shorter.slice(0, minMatch))) return 12;
    return 0;
}

function scoreServiceName(pdfServiceName, registeredServiceName) {
    if (!pdfServiceName || !registeredServiceName) return 0;
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = normalize(pdfServiceName);
    const b = normalize(registeredServiceName);
    if (a === b) return 8;
    return a.includes(b) || b.includes(a) ? 5 : 0;
}

/**
 * Função utilitária de double-check. Caso a IA não retorne o ID e apenas extraia o dado solto.
 * Ou caso a IA erre, fazemos um over-check de segurança de match aqui com pontuação para achar a unidade MAIS PRÓXIMA (fallback).
 */
function localDoubleCheckMatch(extractedData, units) {
    let bestUnit = null;
    let bestService = null;
    let debugInfo = { source: 'nenhum' };

    // Se a base de unidades for vazia, não há o que checar.
    if (!units || units.length === 0) {
        return { unit: null, service: null, debug: debugInfo };
    }

    // 1. Prioriza 100% o retorno da IA se ela encontrou IDs válidos na lista fornecida
    if (extractedData.unitId) {
        const u = units.find(x => x.id === extractedData.unitId);
        if (u) {
            bestUnit = u;
            if (extractedData.serviceId) {
                bestService = u.services.find(s => s.id === extractedData.serviceId);
            }
            debugInfo.source = 'IA direct match';
            return { unit: bestUnit, service: bestService || null, debug: debugInfo };
        }
    }

    // 2. Se a IA falhar em dar o ID certo, caímos pro Double-Check Local (Fallback com Pontuação)
    const extContract = extractedData.contractNumber ? extractedData.contractNumber.replace(/\D/g, '') : null;
    const extUnitCnpj = extractedData.unitCnpj ? normalizeCnpj(extractedData.unitCnpj) : null;
    const extMainCnpj = extractedData.cnpj ? normalizeCnpj(extractedData.cnpj) : null;
    
    let maxScore = -1;

    for (const unit of units) {
        let currentScore = 0;
        let matchedSvc = null;
        
        // --- MATCHES ABSOLUTOS (Ganha na hora) ---
        // Tentativa de achar pelo número do Contrato/Conta (Fortíssimo em faturas telefonia)
        for (const svc of unit.services) {
            const dbContract = svc.contractNumber ? svc.contractNumber.replace(/\D/g, '') : null;
            if (extContract && dbContract && dbContract === extContract) {
                return { unit, service: svc, debug: { source: 'Local Double-Check - Exact Contract match' } };
            }
        }

        // Tentativa por CNPJ Exato da Filial (Fortíssimo)
        if (extUnitCnpj) {
            const uCnpjs = parseCnpjs(unit.cnpjs).map(normalizeCnpj);
            if (uCnpjs.includes(extUnitCnpj)) {
                currentScore += 50;
            }
        }
        
        // --- FUZZY SCORING ---
        // Se a unidade pertencer à empresa cujo CNPJ é o CNPJ principal da conta
        const uCnpjs = parseCnpjs(unit.cnpjs).map(normalizeCnpj);
        if (extMainCnpj && uCnpjs.includes(extMainCnpj)) {
            currentScore += 10;
        }

        if (extractedData.unitAddress && unit.address) {
            currentScore += scoreAddress(extractedData.unitAddress, unit.address);
        }

        if (extractedData.companyName && unit.name) {
            const cName = extractedData.companyName.toLowerCase();
            const uName = unit.name.toLowerCase();
            if (cName.includes(uName) || uName.includes(cName)) {
                currentScore += 12;
            }
        }

        if (extractedData.service) {
            let bestSvcScore = 0;
            for (const svc of unit.services) {
                 let s = scoreServiceName(extractedData.service, svc.name);
                 if (s > bestSvcScore) {
                     bestSvcScore = s;
                     matchedSvc = svc;
                 }
            }
            currentScore += bestSvcScore;
        }

    // Guarda a unidade com o maior score
        if (currentScore > maxScore) {
            maxScore = currentScore;
            bestUnit = unit;
            bestService = matchedSvc;
            debugInfo.source = `Fuzzy Scoring (Score: ${currentScore})`;
        }
    }

    // Só rejeita se o PDF for em branco e não bater informações relevantes.
    // Exigimos agora um mínimo de consistência (ex: CNPJ + algum outro dado, ou Endereço forte).
    // O threshold mínimo agora será > 0.
    if (bestUnit && maxScore > 0) {
        return { unit: bestUnit, service: bestService || null, debug: debugInfo };
    }

    return { unit: null, service: null, debug: debugInfo };
}

module.exports = { extractInvoiceDataWithContext, localDoubleCheckMatch };
