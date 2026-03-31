/**
 * Constantes de negócio centralizadas do sistema CRM SOBEI.
 */

/** Raiz do CNPJ da Vivo / Telefônica Brasil S/A — deve ser ignorado nas faturas. */
const VIVO_CNPJ_ROOT = '02558157';

/** CNPJ da SOBEI Matriz — usado como fallback final quando nenhuma unidade é identificada. */
const SOBEI_MATRIZ_CNPJ = '53.818.191/0001-60';

/** Modelo de IA utilizado para extração de faturas. */
const AI_MODEL = 'gpt-4o-mini';

/** Tamanho máximo do texto de PDF enviado ao prompt da IA (em caracteres). */
const PDF_TEXT_LIMIT = 15000;

module.exports = {
    VIVO_CNPJ_ROOT,
    SOBEI_MATRIZ_CNPJ,
    AI_MODEL,
    PDF_TEXT_LIMIT,
};
