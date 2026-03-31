
import os

css_path = r'c:\Users\ServidorSobei\OneDrive - SOCIEDADE BENEFICENTE EQUILIBRIO DE INTERLAGOS\Área de Trabalho\CRM-SOBEI\frontend\src\index.css'

upload_queue_css = """
/* ──────────────────────────────────────────────
   UPLOAD QUEUE STYLING
   ────────────────────────────────────────────── */
.upload-queue {
  margin-top: 16px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 12px;
  max-width: 100%;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.queue-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.queue-actions {
  display: flex;
  gap: 8px;
}

.btn-queue-clear, .btn-queue-clear-all {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-soft);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-queue-clear:hover {
  background: var(--bg-card-soft);
  color: var(--text-primary);
}

.btn-queue-clear-all:hover {
  background: var(--danger-soft);
  color: var(--danger);
  border-color: var(--danger);
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}

.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: transform 0.1s;
}

.queue-item--processing {
  border-left: 4px solid #3b82f6;
}

.queue-item--done {
  border-left: 4px solid var(--success);
}

.queue-item--error {
  border-left: 4px solid var(--danger);
}

.queue-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.queue-item-name {
  font-size: 0.85rem;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.queue-meta-tag {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
}

.btn-remove-queue {
  background: none;
  border: none;
  color: var(--text-soft);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}

.btn-remove-queue:hover {
  color: var(--danger);
  opacity: 1;
}

.progress-track {
  width: 100%;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  margin-top: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--success);
  transition: width 0.3s ease;
}
"""

with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

if '.upload-queue' not in content:
    with open(css_path, 'a', encoding='utf-8') as f:
        f.write(upload_queue_css)
    print("Styles appended successfully.")
else:
    print("Styles already present.")
