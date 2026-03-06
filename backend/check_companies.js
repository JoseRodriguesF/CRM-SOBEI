const { PrismaClient } = require('@prisma/client');

async function check(url) {
    console.log(`Buscando empresas na URL: ${url}`);
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
        const companies = await prisma.company.findMany();
        console.log(`SUCESSO! Empresa encontradas: ${companies.length}`);
        console.log(JSON.stringify(companies, null, 2));
        return true;
    } catch (e) {
        console.log(`Falha: ${e.message}`);
        return false;
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    const urls = [
        process.env.DATABASE_URL,
        "postgresql://postgres:root@localhost:5432/crmSobei?schema=public",
        "postgresql://postgres:root@127.0.0.1:5432/crmSobei?schema=public"
    ];

    for (const url of urls) {
        if (await check(url)) break;
    }
}

main();
