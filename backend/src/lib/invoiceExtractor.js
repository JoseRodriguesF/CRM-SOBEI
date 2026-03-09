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

const PDF_PROMPT = (text, unitsContext, allowedCnpjs) => `
Você é um assistente especializado em extrair dados de faturas corporativas em PDFs (ex: Vivo Empresas).
Abaixo está a lista de unidades e faturamentos da empresa que você deve considerar como CLIENTES legítimos:

[CLIENTES CADASTRADOS (SEUS POSSÍVEIS DESTINATÁRIOS)]
${unitsContext}
CNPJs Válidos para Match: ${allowedCnpjs.join(', ')}
[/CLIENTES CADASTRADOS]

Com base no texto da fatura fornecido abaixo, sua missão principal é:
1. Localizar o campo DESTINATÁRIO, DADOS DO CLIENTE ou RAZÃO SOCIAL. 
   - Geralmente aparece como: "Razão Social: SOCIEDADE BENEFICENTE EQUILIBRIO DE INTERLAGOS... CNPJ: 53.818.191/0001-60".
2. Extrair o CNPJ do CLIENTE (quem utiliza o serviço). 
   - ATENÇÃO: É TERMINANTEMENTE PROIBIDO pegar o CNPJ da VIVO / Telefônica Brasil S/A (raiz 02.558.157). 
   - IGNORE o CNPJ do emissor que aparece no cabeçalho ou rodapé como "Telefônica Brasil S/A" ou "CNPJ Matriz/Emitente: 02.558.157/XXXX-XX".
   - IMPORTANTE: Muitas faturas têm o CNPJ da MATRIZ (pagador) e o CNPJ da FILIAL (instalação). Você deve priorizar o CNPJ da FILIAL/UNIDADE que está recebendo o serviço, que geralmente está próximo ao endereço de instalação.
3. Extrair dados financeiros: Valor total, Vencimento (dueDate), Mês de Referência (MM/AAAA). 
   - Verifique o campo 'Total a Pagar' ou 'Valor Total da Fatura'.
4. Tentar vincular essa fatura a uma das unidades (unitId) e serviços (serviceId) da lista acima.
   - Várias unidades podem compartilhar o mesmo CNPJ. Use o 'Número do Contrato/Conta' (contractNumber) e o 'Endereço de Instalação' como critérios de desempate definitivos.

Retorne APENAS um JSON válido seguindo este modelo:
{
  "cnpj": "CNPJ do CLIENTE/PAGADOR (ex: 53.818.191/0001-60)",
  "companyName": "Nome da empresa cliente",
  "unitId": ID da unidade (da lista acima ou null),
  "serviceId": ID do serviço (da lista acima ou null),
  "unitCnpj": "CNPJ da filial/unidade na nota",
  "unitAddress": "Endereço de instalação na nota",
  "contractNumber": "Número da conta/contrato (longo, ex: 8999...)",
  "phoneNumber": "Telefone de referência",
  "referenceMonth": "MM/AAAA",
  "totalAmount": 123.45,
  "dueDate": "AAAA-MM-DD",
  "service": "Tipo de serviço (ex: Vivo Fixa, Vivo Móvel)",
  "status": "ABERTA"
}

Texto da fatura (1ª página):
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
    const allowedCnpjs = [...new Set(units.flatMap(u => parseCnpjs(u.cnpjs)))];

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: 'Você é um especialista em análise de faturas de telecom. Sua prioridade absoluta é identificar o CLIENTE pagador e ignorar o EMISSOR Vivo.',
            },
            { role: 'user', content: PDF_PROMPT(rawText, contextStr, allowedCnpjs) },
        ],
        response_format: { type: 'json_object' },
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    console.log('[IA-Debug] Dados extraídos e match primário da IA:', JSON.stringify(raw, null, 2));

    // Bloqueio de Segurança: Se a IA insistir em pegar o CNPJ da Vivo, ou se quisermos garantir o CNPJ da unidade correta
    const cleanCnpj = raw.cnpj ? raw.cnpj.replace(/\D/g, '') : '';
    const VIVO_ROOT = '02558157';

    if (cleanCnpj.startsWith(VIVO_ROOT) || raw.unitId || !raw.cnpj) {
        const cnpjRegex = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
        const matches = rawText.match(cnpjRegex) || [];
        // Filtra CNPJs que NÃO são da Vivo
        const clientCnpjs = [...new Set(matches.filter(c => !c.replace(/\D/g, '').startsWith(VIVO_ROOT)))];

        if (raw.unitId) {
            const unit = units.find(u => u.id === raw.unitId);
            if (unit) {
                const uCnpjs = parseCnpjs(unit.cnpjs).map(normalizeCnpj);
                // Se o CNPJ que a IA pegou é da Vivo OU não é um dos CNPJs cadastrados para ESSA unidade, tentamos corrigir
                if (cleanCnpj.startsWith(VIVO_ROOT) || !uCnpjs.includes(normalizeCnpj(raw.cnpj))) {
                    const matchedBranchCnpj = clientCnpjs.find(c => uCnpjs.includes(normalizeCnpj(c)));
                    if (matchedBranchCnpj) {
                        console.log(`[IA-Fallback] Corrigindo CNPJ para o CNPJ específico da Unidade: ${matchedBranchCnpj}`);
                        raw.cnpj = matchedBranchCnpj;
                    } else if (uCnpjs.length > 0 && (cleanCnpj.startsWith(VIVO_ROOT) || !raw.cnpj)) {
                        // Se a IA pegou a VIVO ou não pegou nada, e não achamos o CNPJ da unidade no texto, usamos o primeiro cadastrado
                        raw.cnpj = uCnpjs[0];
                    }
                }
            }
        } else if (cleanCnpj.startsWith(VIVO_ROOT) || !raw.cnpj) {
            // Se não tem unitId mas pegou a Vivo ou nada, tenta um detector heurístico de Razão Social
            const cnpjNearRazao = rawText.match(/Raz[ãa]o\s+Social.*?(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/is);

            if (cnpjNearRazao && !cnpjNearRazao[1].replace(/\D/g, '').startsWith(VIVO_ROOT)) {
                raw.cnpj = cnpjNearRazao[1];
                console.log(`[IA-Fallback] CNPJ encontrado via detecção de 'Razão Social': ${raw.cnpj}`);
            } else if (clientCnpjs.length > 0) {
                // Se não achou perto da Razão Social, pega o primeiro que não seja Vivo
                raw.cnpj = clientCnpjs[0];
                console.log(`[IA-Fallback] CNPJ da Vivo substituído pelo primeiro CNPJ de cliente encontrado: ${raw.cnpj}`);
            }
        }
    }


    // Fallback Manual Robusto para Contract Number (prática boa existente mantida)
    if (!raw.contractNumber) {
        // Regex para capturar números de conta longos típicos da Vivo que a IA pode ter pulado
        const fallbackMatch = rawText.match(/Conta[:\s]+(\d{10,14})/i) ||
            rawText.match(/Conta[^0-9]+(\d{10,14})/i) ||
            rawText.match(/N[úu]mero\s+da\s+Conta[:\s]+(\d{10,14})/i) ||
            rawText.match(/CADASTRADO\s+EM\s+NOME\s+DE.*?(\d{10,14})/is);

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
