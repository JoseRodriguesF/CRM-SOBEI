import React from 'react';

/**
 * Modal genérico de confirmação para ações destrutivas ou importantes.
 */
export function ConfirmModal({
    show,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger',
    loading = false
}) {
    if (!show) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-box modal-box--sm">
                <div className="confirm-modal-body">
                    <div className={`confirm-icon confirm-icon--${type === 'danger' ? 'danger' : 'info'}`}>
                        {type === 'danger' ? '🗑' : '?'}
                    </div>
                    <h3 className="confirm-title">{title}</h3>
                    <p className="confirm-message">{message}</p>
                </div>
                <div className="confirm-actions">
                    <button
                        className="btn btn-ghost"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        {cancelText}
                    </button>
                    <button
                        className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? 'Processando...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
