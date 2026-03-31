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
    loading = false,
    children,
}) {
    if (!show) return null;

    const isDanger = type === 'danger';

    return (
        <div className="modal-overlay">
            <div className="modal-box modal-box--sm">
                <div className="confirm-modal-body">
                    <div className={`confirm-icon confirm-icon--${isDanger ? 'danger' : 'info'}`}>
                        {isDanger ? '🗑' : '?'}
                    </div>
                    <h3 className="confirm-title">{title}</h3>
                    {message && <p className="confirm-message">{message}</p>}
                    {children && <div className="confirm-custom-content">{children}</div>}
                </div>
                <div className="confirm-actions">
                    <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>
                        {cancelText}
                    </button>
                    <button className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={loading}>
                        {loading ? 'Processando...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
