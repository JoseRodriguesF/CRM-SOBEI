const pdf = require('pdf-parse');
console.log('pdf type:', typeof pdf);
console.log('pdf contents:', Object.keys(pdf));

const fs = require('fs');

async function main() {
    const fileName = '1772652704682-892740617-gvtinv_510870145548.pdf';
    const filePath = `c:\\Users\\josea\\Desktop\\CRM Faturas\\backend\\uploads\\${fileName}`;
    const buffer = fs.readFileSync(filePath);

    // Tentamos usar como o invoiceExtractor faz
    try {
        const { PDFParse } = require('pdf-parse');
        if (PDFParse) {
            console.log('Using PDFParse class...');
            const parser = new PDFParse({ data: buffer });
            const data = await parser.getText();
            console.log('Text length:', data.text.length);
            console.log('Preview:', data.text.substring(0, 500));
        } else {
            console.log('PDFParse not found in exports, using default function...');
            const data = await pdf(buffer);
            console.log('Text length:', data.text.length);
            console.log('Preview:', data.text.substring(0, 500));
        }
    } catch (e) {
        console.error('Error:', e.message);
        const data = await pdf(buffer);
        console.log('Fallback Text length:', data.text.length);
        console.log('Fallback Preview:', data.text.substring(0, 500));
    }
}

main();
