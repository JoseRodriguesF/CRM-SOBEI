// ─── Constants ────────────────────────────────────────────────────────────────

const TOAST_ICONS = { success: '✓', error: '!', warning: '⚠', info: 'i' };
const TOAST_TTL_MS = 5000;

// ─── ToastContainer ───────────────────────────────────────────────────────────

/**
 * Pilha de notificações Toast que aparecem no canto inferior.
 */
export function ToastContainer({ toasts, removeToast }) {
    if (!toasts.length) return null;

    return (
        <div className="toast-stack">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast--${t.type}`}>
                    <div className="toast-icon">{TOAST_ICONS[t.type] ?? 'i'}</div>
                    <div className="toast-msg">{t.message}</div>
                    <button className="toast-close" onClick={() => removeToast(t.id)}>×</button>
                </div>
            ))}
        </div>
    );
}
