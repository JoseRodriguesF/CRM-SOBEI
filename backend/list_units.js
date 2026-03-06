const prisma = require('./src/lib/prisma');

async function main() {
    try {
        const units = await prisma.unit.findMany({
            include: {
                services: true
            }
        });

        console.log(JSON.stringify(units, null, 2));
    } catch (e) {
        console.error('Error fetching units:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
