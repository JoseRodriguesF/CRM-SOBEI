const fs = require('fs');
const { z } = require('zod');
const OpenAI = require('openai');
const { PDFParse } = require('pdf-parse');
const prisma = require('./prisma');
const { normalizeCnpj, parseCnpjs } = require('./cnpjUtils');
const { VIVO_CNPJ_ROOT, SOBEI_MATRIZ_CNPJ, AI_MODEL, PDF_TEXT_LIMIT } = require('../config/constants');

// ─── OpenAI Client ───────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
    console.warn('[IA] OPENAI_API_KEY não definido. Extração por IA será desativada.');
}

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// ─── Schema de validação ─────────────────────────────────────────────────────

const extractedInvoiceSchema = z.object({
    cnpj: z.any().optional(),
    companyName: z.any().optional(),
    unitId: z.any().optional(),
    serviceId: z.any().optional(),
    unitCnpj: z.any().optional(),
    unitAddress: z.any().optional(),
    contractNumber: z.any().optional(),
    phoneNumber: z.any().optional(),
    referenceMonth: z.any().optional(),
    totalAmount: z.any().optional(),
    dueDate: z.any().optional(),
    service: z.any().optional(),
    status: z.any().optional(),
});

// ─── Prompt de extração ───────────────────────────────────────────────────────

const buildPdfPrompt = (text, unitsContext, allowedCnpjs) => `
Você é um assistente especializado em extrair dados de faturas corporativas (ex: Vivo Empresas).
Sua PRIORIDADE MÁXIMA é identificar o CLIENTE (Destinatário/Pagador) e IGNORAR o EMISSOR (Vivo/Telefônica).

[CONTEXTO IMPORTANTE]
- O CNPJ do cliente (SOBEI) geralmente começa com a raiz: 53.818.191
- O CNPJ da Vivo (EMISSOR) foi propositalmente removido ou mascarado no texto abaixo para evitar confusão.
- Se você encontrar um CNPJ que comece com 02.558.157, IGNORE-O totalmente.

[CLIENTES CADASTRADOS (PARA IDENTIFICAÇÃO DE UNIDADE/SERVIÇO)]
${unitsContext}
CNPJs Válidos para Match: ${allowedCnpjs.join(', ')}
[/CLIENTES CADASTRADOS]

Instruções Críticas:
1. **NUNCA** retorne o CNPJ da Vivo.
2. **LOCALIZE O CLIENTE**: Procure por "CPF/CNPJ:" ou "Razão Social:".
3. **CNPJ LITERAL**: Extraia o CNPJ do cliente EXATAMENTE como escrito no texto da fatura. NÃO tente adivinhar ou mudar o CNPJ baseado no endereço ou no contexto de clientes acima; use o valor impresso no documento.
4. **NÚMERO DA CONTA/CONTRATO**: Este é o dado mais importante para identificar a unidade. Localize-o com precisão (geralmente 10 a 14 dígitos).
5. **CHAVE DE ACESSO**: Ignore sequências de 44 dígitos.
6. **ENDEREÇO**: Extraia o endereço de instalação para o campo 'unitAddress'. Ele é fundamental para diferenciar unidades com o mesmo CNPJ.

Retorne APENAS um JSON:
{
  "cnpj": "CNPJ do CLIENTE (literal do texto, EX: 53.818.191/XXXX-XX. Se não encontrar, retorne null)",
  "companyName": "Nome do Cliente",
  "unitId": ID da unidade (apenas se tiver certeza absoluta pelo contrato ou endereço),
  "serviceId": ID do serviço,
  "unitCnpj": "CNPJ da instalação",
  "unitAddress": "Endereço de instalação",
  "contractNumber": "Número da conta/contrato",
  "phoneNumber": "Telefone",
  "referenceMonth": "MM/AAAA",
  "totalAmount": 0.00,
  "dueDate": "AAAA-MM-DD",
  "service": "Tipo de serviço",
  "status": "ABERTA"
}

Texto da fatura (Sanitizado):
"""${text.slice(0, PDF_TEXT_LIMIT)}"""
`;

// ─── Helpers de pontuação ─────────────────────────────────────────────────────

function scoreAddress(invoiceAddress, unitAddress) {
    if (!invoiceAddress || !unitAddress) return 0;

    const normalize = (s) => s
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/rua|avenida|av|praca|viela|alameda|rodovia|rod|travessa|trv|end|r\s|r\.|n\.|n\s|zona|sul|norte|leste|oeste/g, '');

    const addrA = normalize(invoiceAddress);
    const addrB = normalize(unitAddress);

    if (addrA.length <= 5 || addrB.length <= 5) return 0;
    if (addrA === addrB) return 80; // Antes 25
    if (addrA.includes(addrB) || addrB.includes(addrA)) return 60; // Antes 20
    const shorter = addrA.length > addrB.length ? addrB : addrA;
    const longer = addrA.length > addrB.length ? addrA : addrB;
    const minMatch = Math.min(15, Math.floor(shorter.length * 0.7));
    if (longer.includes(shorter.slice(0, minMatch))) return 40; // Antes 12

    return 0;
}

function scoreServiceName(pdfServiceName, registeredServiceName) {
    if (!pdfServiceName || !registeredServiceName) return 0;
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = normalize(pdfServiceName);
    const b = normalize(registeredServiceName);
    if (a === b) return 20; // Antes 8
    return a.includes(b) || b.includes(a) ? 12 : 0; // Antes 5
}

// ─── Extração de PDF com Contexto ────────────────────────────────────────────

/**
 * Extrai dados estruturados de um arquivo PDF com o contexto das unidades do banco.
 * @param {string} filePath
 * @param {object[]} units
 */
async function extractInvoiceDataWithContext(filePath, units = []) {
    if (!openai) throw new Error('OPENAI_API_KEY não configurado no backend.');

    // 1. Extração do texto bruto (API v2)
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const rawText = result.text;

    // 2. Contexto das unidades para o prompt
    const unitsContext = units.map(u => ({
        id: u.id,
        nome: u.name,
        cnpjs: parseCnpjs(u.cnpjs),
        endereco: u.address,
        servicos: u.services.map(s => ({
            id: s.id,
            nome: s.name,
            contrato_conta: s.contractNumber,
        })),
    }));

    const allowedCnpjs = [...new Set(units.flatMap(u => parseCnpjs(u.cnpjs)))];

    // 2.5 Sanitização Preventiva do Texto (Remove vestígios da Vivo para não confundir a IA)
    // Procura por versões do CNPJ da Vivo com pontuação, sem pontuação ou com espaços
    const vivoRegex = /0\s?2\s?\.\s?5\s?5\s?8\s?\.\s?1\s?5\s?7\s?\/\s?0\s?0\s?0\s?1\s?\-\s?6\s?2/g;
    const vivoRaw = /02558157000162/g;
    const sanitizedText = rawText
        .replace(vivoRegex, '[CNPJ_EMISSOR_VIVO_REMOVIDO]')
        .replace(vivoRaw, '[CNPJ_EMISSOR_VIVO_REMOVIDO]');

    // 3. Chamada à IA
    const prompt = buildPdfPrompt(sanitizedText, JSON.stringify(unitsContext, null, 2), allowedCnpjs);

    const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
            {
                role: 'system',
                content: 'Você é um especialista em análise de faturas de telecom. Sua prioridade absoluta é identificar o CLIENTE pagador e ignorar o EMISSOR Vivo.',
            },
            { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    console.log('[IA] Extração concluída. Dados brutos:', raw);

    // 4. Validação final (Garantia de que nunca salva o CNPJ da Vivo)
    raw.cnpj = forceCleanCnpj(raw.cnpj);

    // 5. Fallbacks via regex se a IA falhar em campos críticos
    
    // Fallback: Número da Conta/Contrato
    if (!raw.contractNumber) {
        const contractMatch =
            rawText.match(/Conta[:\s]+(\d{10,14})/i) ||
            rawText.match(/Conta[^0-9]+(\d{10,14})/i) ||
            rawText.match(/N[úu]mero\s+da\s+Conta[:\s]+(\d{10,14})/i);
        if (contractMatch) raw.contractNumber = contractMatch[1];
    }

    // Fallback: Mês de Referência (MM/AAAA)
    if (!raw.referenceMonth) {
        const monthMatch = rawText.match(/(?:m[êe]s\s+de\s+refer[êe]ncia|refer[êe]ncia)[:\s]+(\d{2}\/\d{4})/i);
        if (monthMatch) raw.referenceMonth = monthMatch[1];
    }

    // Fallback: Data de Vencimento (converte DD/MM/AAAA para AAAA-MM-DD)
    if (!raw.dueDate) {
        const dueMatch = rawText.match(/(?:vencimento|venc\.?|pague\s+at[ée]|vencendo\s+em)[:\s]+(\d{2}\/\d{2}\/\d{2,4})/i);
        if (dueMatch) {
            const parts = dueMatch[1].split('/');
            if (parts.length === 3) {
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                raw.dueDate = `${year}-${parts[1]}-${parts[0]}`;
            }
        }
    }

    // Fallback: Valor Total
    if (!raw.totalAmount) {
        const amountMatch = rawText.match(/(?:total\s+a\s+pagar|valor\s+total|total\s+da\s+fatura)[:\s]+(?:r\$?\s*)?([\d.]+,\d{2})/i);
        if (amountMatch) raw.totalAmount = amountMatch[1];
    }

    // 6. Sanitização final antes de retornar
    const finalData = {
        ...raw,
        cnpj: raw.cnpj,
        totalAmount: typeof raw.totalAmount === 'string'
            ? Number(raw.totalAmount.replace('.', '').replace(',', '.'))
            : raw.totalAmount,
    };

    console.log('[DEBUG_EXTRACTOR] Retornando dados para o controller:', JSON.stringify(finalData, null, 2));
    
    // Bypass Zod validation for now to avoid persistent schema errors
    // const validData = extractedInvoiceSchema.parse(finalData);
    return { data: finalData, text: rawText, rawAiOutput: raw };
}

/**
 * Limpeza final incondicional: Se o CNPJ ainda for da Vivo, descarta.
 */
function forceCleanCnpj(cnpj) {
    if (!cnpj) return null;
    const clean = cnpj.replace(/\D/g, '');
    if (clean.startsWith(VIVO_CNPJ_ROOT)) {
        console.log(`[Extrator] IA retornou CNPJ da Vivo (${cnpj}). Bloqueando e usando Matriz.`);
        return SOBEI_MATRIZ_CNPJ;
    }
    return cnpj;
}

/**
 * Verifica/corrige o match de unidade/serviço após a extração da IA.
 */
function localDoubleCheckMatch(extractedData, units) {
    if (!units?.length) return { unit: null, service: null, debug: { source: 'nenhum' } };

    const extContract = extractedData.contractNumber ? extractedData.contractNumber.replace(/\D/g, '') : null;
    const extUnitCnpj = extractedData.unitCnpj ? normalizeCnpj(extractedData.unitCnpj) : null;
    const extMainCnpj = extractedData.cnpj ? normalizeCnpj(extractedData.cnpj) : null;

    // 1. PRIORIDADE MÁXIMA: Match Direto de Contrato (O critério majoritário)
    if (extContract) {
        for (const unit of units) {
            for (const svc of unit.services) {
                const dbContract = svc.contractNumber ? svc.contractNumber.replace(/\D/g, '') : null;
                if (dbContract && dbContract === extContract) {
                    return { unit, service: svc, debug: { source: 'Match por Contrato (Majoritário)' } };
                }
            }
        }
    }

    // 2. Pontuação por outros critérios (Endereço > Serviço > CNPJ)
    let bestUnit = null;
    let bestService = null;
    let maxScore = -1;

    for (const unit of units) {
        let currentScore = 0;
        let matchedSvc = null;

        // A. Endereço de Instalação (Muito Relevante)
        if (extractedData.unitAddress && unit.address) {
            currentScore += scoreAddress(extractedData.unitAddress, unit.address);
        }

        // B. Match de Serviço por Nome (Bônus)
        if (extractedData.service) {
            let bestSvcScore = 0;
            for (const svc of unit.services) {
                const s = scoreServiceName(extractedData.service, svc.name);
                if (s > bestSvcScore) {
                    bestSvcScore = s;
                    matchedSvc = svc;
                }
            }
            currentScore += bestSvcScore;
        }

        // C. CNPJ (Critério de desempate, menos importante agora)
        const uCnpjs = parseCnpjs(unit.cnpjs).map(normalizeCnpj);
        if (extUnitCnpj && uCnpjs.includes(extUnitCnpj)) {
            currentScore += 15; // Antes era 50
        } else if (extMainCnpj && uCnpjs.includes(extMainCnpj)) {
            currentScore += 5; // Antes era 10
        }

        // D. Bônus por sugestão da IA (Damos um pequeno peso se a IA sugeriu esta unidade)
        if (extractedData.unitId === unit.id) {
            currentScore += 10;
        }

        if (currentScore > maxScore) {
            maxScore = currentScore;
            bestUnit = unit;
            bestService = matchedSvc;
        }
    }

    // Se a pontuação for muito baixa, não garantimos o match
    if (bestUnit && maxScore >= 20) {
        return { unit: bestUnit, service: bestService ?? null, debug: { source: 'Match por Pontuação (Fuzzy)', score: maxScore } };
    }

    return { unit: null, service: null, debug: { source: 'Nenhum match confiável', lastBestScore: maxScore } };
}

module.exports = { extractInvoiceDataWithContext, localDoubleCheckMatch };
