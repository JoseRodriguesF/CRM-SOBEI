const fs = require('fs');
const pdf = require('pdf-parse');

async function main() {
    const fileName = '1772652704682-892740617-gvtinv_510870145548.pdf';
    const filePath = `c:\\Users\\josea\\Desktop\\CRM Faturas\\backend\\uploads\\${fileName}`;

    if (!fs.existsSync(filePath)) {
        console.log(`Arquivo não encontrado em: ${filePath}`);
        return;
    }

    const dataBuffer = fs.readFileSync(filePath);

    pdf(dataBuffer).then(function (data) {
        console.log('--- TEXTO COMPLETO DO PDF ---');
        console.log(data.text);
        console.log('--- FIM DO TEXTO ---');

        // Testando os Regex
        const regex1 = /N[úumero\s]+da\s+Conta[:\s]+(\d+)/i;
        const regex2 = /Conta[:\s]+(\d+)/i;
        const regex3 = /C[óodigo\s]+do\s+Cliente[:\s]+(\d+)/i;

        console.log('Teste Regex 1 (Número da Conta):', data.text.match(regex1));
        console.log('Teste Regex 2 (Conta):', data.text.match(regex2));
        console.log('Teste Regex 3 (Código do Cliente):', data.text.match(regex3));
    });
}

main().catch(console.error);
