const prisma = require('./src/lib/prisma');
const { normalizeCnpj, parseCnpjs, contractsOverlap } = require('./src/lib/cnpjUtils');

// Simulando a função scoreAddress do invoiceExtractor
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

async function debugMatch(companyId, data) {
    console.log(`\n--- DEBUG MATCH para Empresa ID: ${companyId} ---`);
    console.log(`Dados da Fatura:`, JSON.stringify(data, null, 2));

    const units = await prisma.unit.findMany({
        where: { companyId },
        include: { services: true },
    });

    console.log(`Unidades encontradas no banco: ${units.length}`);
    if (units.length === 0) {
        const allUnits = await prisma.unit.findMany();
        console.log(`Total de unidades em TODO o banco: ${allUnits.length}`);
        allUnits.forEach(u => console.log(`  - ${u.name} (Empresa ID: ${u.companyId})`));
    }

    const { cnpj: mainCnpj, unitCnpj, unitAddress, contractNumber, service: pdfServiceName } = data;
    const normMain = normalizeCnpj(mainCnpj);
    const normUnit = unitCnpj ? normalizeCnpj(unitCnpj) : null;

    for (const unit of units) {
        let score = 0;
        let detail = { cnpjMatch: 0, unitCnpjMatch: 0, addressMatch: 0, contractMatch: 0, serviceMatch: 0, nameInText: 0 };

        // Nome no texto
        if (data.companyName && unit.name) {
            const normCompName = data.companyName.toLowerCase();
            const normUnitName = unit.name.toLowerCase();
            if (normCompName.includes(normUnitName) || normUnitName.includes(normCompName)) {
                score += 12;
                detail.nameInText = 12;
            }
        }

        const unitCnpjs = parseCnpjs(unit.cnpjs).map(normalizeCnpj);
        if (normUnit && unitCnpjs.includes(normUnit)) {
            score += 20;
            detail.unitCnpjMatch = 20;
        } else if (unitCnpjs.includes(normMain)) {
            score += 8;
            detail.cnpjMatch = 8;
        }

        if (unitAddress && unit.address) {
            const s = scoreAddress(unitAddress, unit.address);
            score += s;
            detail.addressMatch = s;
        }

        if (contractNumber || pdfServiceName) {
            let best = 0;
            for (const svc of unit.services) {
                let s = 0;
                if (contractNumber && contractsOverlap(contractNumber, svc.contractNumber)) s += 25;
                const ns = scoreServiceName(pdfServiceName, svc.name);
                s += ns;
                if (s > best) best = s;
            }
            score += best;
            detail.serviceMatch = best;
        }

        console.log(`Unidade: ${unit.name} | Score Total: ${score}`);
        console.log(`  Detalhes:`, detail);
    }
}

const data = {
    cnpj: "53.818.191/0001-60",
    companyName: "SOCIEDADE BENEFICENTE EQUILIBRIO DE INTERLAGOS",
    unitCnpj: null,
    unitAddress: "R ANGELINA R C DE MENDONCA 51 JARDIM REGIS",
    contractNumber: "899926846632",
    service: "VIVO Fibra 600 Mega Empresas"
};

debugMatch(1, data)
    .catch(console.error)
    .finally(() => prisma.$disconnect());
