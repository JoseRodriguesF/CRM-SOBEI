
import os

css_path = r'c:\Users\ServidorSobei\OneDrive - SOCIEDADE BENEFICENTE EQUILIBRIO DE INTERLAGOS\Área de Trabalho\CRM-SOBEI\frontend\src\index.css'

new_styles = """
/* ──────────────────────────────────────────────
   TABLE ACTIONS ALIGNMENT
   ────────────────────────────────────────────── */
.table-actions > div {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  flex-wrap: nowrap !important;
}

.btn-table, .btn-table-pay, .btn-table-delete, .link-pdf {
  white-space: nowrap !important;
  flex-shrink: 0 !important;
  margin: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
"""

with open(css_path, 'a', encoding='utf-8') as f:
    f.write(new_styles)
print("Table action alignment appended.")
