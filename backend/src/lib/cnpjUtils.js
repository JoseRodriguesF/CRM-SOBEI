/**
 * Utilitários para manipulação de CNPJs e números de contrato.
 */

/** Remove tudo que não for dígito de um CNPJ. */
function normalizeCnpj(value) {
    return (value || '').replace(/\D/g, '');
}

/**
 * Faz parse do campo cnpjs armazenado como JSON string no banco.
 * Aceita: JSON array, string única, lista separada por vírgulas.
 * @param {string|string[]|null} value
 * @returns {string[]}
 */
function parseCnpjs(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);

    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
        // não é JSON — trata como string única ou separada por vírgula
    }

    return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * Serializa um array de CNPJs para JSON string para armazenar no banco.
 * Retorna null se o array estiver vazio.
 * @param {string[]} arr
 * @returns {string|null}
 */
function serializeCnpjs(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return JSON.stringify(arr);
}

/**
 * Extrai números com 4+ dígitos de uma string (para matching de contratos).
 * @param {string} value
 * @returns {string[]}
 */
function extractContractNumbers(value) {
    return (value || '').match(/\d{4,}/g) || [];
}

/**
 * Verifica se dois grupos de números de contrato têm interseção.
 * @param {string} a  String de contrato A
 * @param {string} b  String de contrato B
 * @returns {boolean}
 */
function contractsOverlap(a, b) {
    const numsA = extractContractNumbers(a);
    const numsB = extractContractNumbers(b);
    return numsA.some((n) => numsB.includes(n));
}

module.exports = {
    normalizeCnpj,
    parseCnpjs,
    serializeCnpjs,
    extractContractNumbers,
    contractsOverlap,
};
