const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const companyId = 1; // Baseado no log do usuário
    const units = await prisma.unit.findMany({
        where: { companyId },
        include: {
            services: true
        }
    });

    console.log(`=== UNIDADES E SERVIÇOS DA EMPRESA ID: ${companyId} ===`);
    units.forEach(u => {
        console.log(`\nUnidade: ${u.name} (ID: ${u.id})`);
        console.log(`  CNPJs cadastrados: ${u.cnpjs}`);
        console.log(`  Endereço: ${u.address}`);
        console.log(`  Serviços:`);
        if (u.services.length === 0) console.log(`    (Nenhum serviço cadastrado)`);
        u.services.forEach(s => {
            console.log(`    - ID: ${s.id} | Nome: ${s.name} | Contrato/Conta: ${s.contractNumber}`);
        });
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
