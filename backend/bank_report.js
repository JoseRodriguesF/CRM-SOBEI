const prisma = require('./src/lib/prisma');

async function main() {
    const companies = await prisma.company.findMany({
        include: {
            units: true
        }
    });

    console.log('--- RELATÓRIO DO BANCO ---');
    companies.forEach(c => {
        console.log(`Empresa: ${c.name} (CNPJ: ${c.cnpj}, ID: ${c.id})`);
        console.log(`Unidades: ${c.units.length}`);
        c.units.forEach(u => {
            console.log(`  - ${u.name} (ID: ${u.id})`);
        });
    });
}

main().finally(() => prisma.$disconnect());
