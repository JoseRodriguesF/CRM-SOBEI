import { useState, useCallback } from 'react';

const TOAST_TTL_MS = 5000;

/**
 * Hook para gerenciar o estado dos toasts.
 */
export function useToasts() {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info') => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), TOAST_TTL_MS);
    }, [removeToast]);

    return { toasts, addToast, removeToast };
}
