const { PrismaClient } = require('@prisma/client');

async function check(url) {
    console.log(`Testing URL: ${url}`);
    const prisma = new PrismaClient({
        datasources: {
            db: { url }
        }
    });
    try {
        const count = await prisma.unit.count();
        console.log(`Success! Units found: ${count}`);
        const units = await prisma.unit.findMany({ include: { services: true } });
        console.log(JSON.stringify(units, null, 2));
        return true;
    } catch (e) {
        console.log(`Failed: ${e.message}`);
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
