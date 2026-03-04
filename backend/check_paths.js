const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({ select: { id: true, pdfPath: true } });
    console.log(JSON.stringify(invoices, null, 2));
}

main().finally(() => prisma.$disconnect());
