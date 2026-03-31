
import os

css_path = r'c:\Users\ServidorSobei\OneDrive - SOCIEDADE BENEFICENTE EQUILIBRIO DE INTERLAGOS\Área de Trabalho\CRM-SOBEI\frontend\src\index.css'

new_styles = """
/* ──────────────────────────────────────────────
   DASHBOARD ANALYSIS SECTIONS
   ────────────────────────────────────────────── */
.analysis-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  grid-column: 1 / -1;
  margin-top: 12px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.analysis-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.analysis-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}

.analysis-item {
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--bg-card-soft);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.analysis-item--critical {
  border-left: 4px solid var(--danger);
}

.analysis-item--warning {
  border-left: 4px solid var(--warning);
}

.analysis-tag {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-soft);
}

.analysis-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.analysis-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.analysis-empty {
  font-size: 0.8rem;
  color: var(--text-soft);
  font-style: italic;
  padding: 12px;
  text-align: center;
}
"""

with open(css_path, 'a', encoding='utf-8') as f:
    f.write(new_styles)
print("Analysis styles appended.")
