import React, { useEffect } from 'react';

/**
 * Pilha de notificações Toast que aparecem no canto inferior.
 */
export function ToastContainer({ toasts, removeToast }) {
    if (!toasts.length) return null;

    return (
        <div className="toast-stack">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast--${t.type}`}>
                    <div className="toast-icon">
                        {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}
                    </div>
                    <div className="toast-msg">{t.message}</div>
                    <button className="toast-close" onClick={() => removeToast(t.id)}>×</button>
                </div>
            ))}
        </div>
    );
}

/**
 * Hook para gerenciar o estado dos toasts.
 */
export function useToasts() {
    const [toasts, setToasts] = React.useState([]);

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    };

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return { toasts, addToast, removeToast };
}
