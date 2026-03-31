import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { IMaskInput } from 'react-imask';

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') ?? '';

const INITIAL_FILTERS = { cnpj: '', month: '', status: '', unitId: '', service: '' };

function formatCompanyName(name) {
    if (!name) return '-';
    if (name.toUpperCase() === 'SOCIEDADE BENEFICENTE EQUILIBRIO DE INTERLAGOS') return 'SOBEI';
    return name;
}

function getStatusLabel(inv) {
    if (inv.status === 'PAGA') return 'PAGA';
    return new Date(inv.dueDate) < new Date() ? 'ATRASADA' : 'EM ABERTO';
}

function getStatusClass(inv) {
    if (inv.status === 'PAGA') return 'paga';
    return new Date(inv.dueDate) < new Date() ? 'atrasada' : 'pendente';
}

function formatCurrency(amount) {
    return Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function displayService(inv) {
    if (inv.service) {
        return (
            <div className="table-cell-group">
                <div className="table-cell-main">{inv.service.name}</div>
                <div className="table-cell-sub">Contrato: {inv.service.contractNumber}</div>
            </div>
        );
    }

    let name = inv.serviceName || '-';
    let contract = inv.contractNumber || '';

    if (name.startsWith('[CONTRATO:')) {
        const match = name.match(/\[CONTRATO:\s*(.*?)\]\s*(.*)/);
        if (match) { contract = match[1]; name = match[2]; }
    }

    return (
        <div className="table-cell-group">
            <div className="table-cell-main">{name}</div>
            {contract && <div className="table-cell-sub">Contrato: {contract}</div>}
        </div>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicesPage({ addToast }) {
    const [invoices, setInvoices] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [summary, setSummary] = useState(null);
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [uploadQueue, setUploadQueue] = useState([]);

    // Estado para o Modal de Pagamento
    const [paymentModal, setPaymentModal] = useState({ show: false, invoice: null, date: new Date().toISOString().split('T')[0] });

    const loadUnits = useCallback(async () => {
        try {
            const data = await api.units.list();
            setUnits(data);
        } catch (err) {
            console.error('[InvoicesPage] loadUnits:', err);
        }
    }, []);

    const loadSummary = useCallback(async () => {
        try {
            const data = await api.invoices.dashboard(filters);
            setSummary(data);
        } catch (err) {
            console.error('[InvoicesPage] loadSummary:', err);
        }
    }, [filters]);

    const loadInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.invoices.list(filters);
            setInvoices(data);
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filters, addToast]);

    useEffect(() => {
        loadInvoices();
        loadUnits();
        loadSummary();
    }, [loadInvoices, loadUnits, loadSummary]);

    const onClearSelection = useCallback(() => setSelectedIds([]), []);

    // Processador da Fila
    useEffect(() => {
        const processNext = async () => {
            if (uploading) return;
            const nextIndex = uploadQueue.findIndex(item => item.status === 'pending');
            if (nextIndex === -1) return;

            setUploading(true);
            const item = uploadQueue[nextIndex];

            setUploadQueue(prev => prev.map((it, idx) =>
                idx === nextIndex ? { ...it, status: 'processing' } : it
            ));

            try {
                const result = await api.invoices.upload(item.file);

                setUploadQueue(prev => prev.map((it, idx) =>
                    idx === nextIndex ? { ...it, status: 'done', result } : it
                ));

                addToast(`Fatura ${item.file.name} processada!`, 'success');
                loadInvoices();
                loadSummary();
            } catch (err) {
                console.error(`[Queue] Erro em ${item.file.name}:`, err);
                setUploadQueue(prev => prev.map((it, idx) =>
                    idx === nextIndex ? { ...it, status: 'error', error: err.message } : it
                ));
                addToast(`Erro ao processar ${item.file.name}: ${err.message}`, 'error');
            } finally {
                setUploading(false);
            }
        };

        processNext();
    }, [uploadQueue, uploading, loadInvoices, loadSummary, addToast]);

    const handleFileUpload = useCallback((e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newItems = files.map(file => ({
            id: `${Date.now()}-${Math.random()}`,
            file,
            status: 'pending'
        }));

        setUploadQueue(prev => [...prev, ...newItems]);
        addToast(`${files.length} arquivo(s) adicionado(s) à fila.`, 'info');
        e.target.value = '';
    }, [addToast]);

    const clearFinishedQueue = () => {
        setUploadQueue(prev => prev.filter(item => item.status === 'pending' || item.status === 'processing'));
    };

    const clearQueue = () => {
        if (!window.confirm('Limpar toda a fila? Isso interromperá processamentos pendentes.')) return;
        setUploadQueue([]);
    };

    const removeFromQueue = (id) => {
        setUploadQueue(prev => prev.filter(item => item.id !== id));
    };

    const handleDelete = useCallback(async (id) => {
        if (!window.confirm('Excluir esta fatura permanentemente?')) return;
        try {
            await api.invoices.delete(id);
            setInvoices(prev => prev.filter(i => i.id !== id));
            setSelectedIds(prev => prev.filter(sid => sid !== id));
            addToast('Fatura excluída.', 'info');
            loadSummary();
        } catch (err) {
            addToast(err.message, 'error');
        }
    }, [addToast, loadSummary]);

    const handleDeleteSelected = useCallback(async () => {
        if (!window.confirm(`Excluir as ${selectedIds.length} faturas selecionadas permanentemente?`)) return;
        setLoading(true);
        try {
            await Promise.all(selectedIds.map(id => api.invoices.delete(id)));
            setInvoices(prev => prev.filter(i => !selectedIds.includes(i.id)));
            setSelectedIds([]);
            addToast('Faturas selecionadas excluídas.', 'info');
            loadSummary();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedIds, addToast, loadSummary]);

    const handleDownloadSelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const ids = selectedIds.join(',');
        window.open(`${BASE_URL}/api/invoices/download-zip?ids=${ids}`, '_blank');
    }, [selectedIds]);

    const handleOpenPaymentModal = (invoice) => {
        setPaymentModal({
            show: true,
            invoice,
            date: new Date().toISOString().split('T')[0]
        });
    };

    const handleConfirmPayment = async () => {
        const { invoice, date } = paymentModal;
        if (!invoice) return;

        setLoading(true);
        try {
            await api.invoices.updateStatus(invoice.id, 'PAGA', date);
            addToast('Pagamento registrado com sucesso!', 'success');
            setPaymentModal({ show: false, invoice: null, date: '' });
            loadInvoices();
            loadSummary();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = useCallback((id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds(prev =>
            prev.length === invoices.length && invoices.length > 0
                ? []
                : invoices.map(i => i.id)
        );
    }, [invoices]);

    const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;

    return (
        <div className="dashboard-layout">
            <div className="layout-main">
                {/* Upload Card */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Importar Fatura (IA)</h3>
                    </div>
                    <div className="card-body">
                        <div className="upload-form">
                            <label className="file-input-wrapper">
                                <span className="file-input-label">Selecionar arquivo PDF</span>
                                <input
                                    type="file"
                                    className="file-input"
                                    accept=".pdf"
                                    multiple
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                />
                            </label>
                            <button className="btn btn-primary" disabled={uploading} type="button">
                                {uploading ? 'Processando...' : 'Analisar PDF'}
                            </button>
                        </div>

                        {uploadQueue.length > 0 && (
                            <div className="upload-queue">
                                <div className="queue-header">
                                    <span className="queue-title">Fila de Processamento ({uploadQueue.filter(i => i.status === 'done').length}/{uploadQueue.length})</span>
                                    <div className="queue-actions">
                                        <button className="btn-queue-clear" onClick={clearFinishedQueue}>Limpar Concluídos</button>
                                        <button className="btn-queue-clear-all" onClick={clearQueue}>Limpar Tudo</button>
                                    </div>
                                </div>
                                <div className="queue-list">
                                    {uploadQueue.map(item => (
                                        <div key={item.id} className={`queue-item queue-item--${item.status}`}>
                                            <div className="queue-item-main">
                                                <span className="queue-item-name">{item.file.name}</span>
                                                {item.status === 'done' && item.result && (
                                                    <div className="queue-item-meta">
                                                        <span className="queue-meta-tag">{item.result.referenceMonth}</span>
                                                        <span className="queue-meta-tag">R$ {formatCurrency(item.result.totalAmount)}</span>
                                                        {item.result.unit && (
                                                            <span className="queue-meta-tag" style={{ border: '1px solid rgba(14, 165, 233, 0.2)' }}>
                                                                {item.result.unit.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {item.status === 'error' && (
                                                    <span className="queue-item-error-msg" style={{ fontSize: '0.7rem', color: 'rgba(239, 68, 68, 0.8)', marginTop: '2px' }}>
                                                        {item.error}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="queue-item-aside">
                                                <span className="queue-item-status">
                                                    {item.status === 'pending' && 'Fila'}
                                                    {item.status === 'processing' && 'Analisando...'}
                                                    {item.status === 'done' && '✓ Pronto'}
                                                    {item.status === 'error' && '✕ Falha'}
                                                </span>
                                                {item.status !== 'processing' && (
                                                    <button 
                                                        className="btn-queue-remove" 
                                                        onClick={() => removeFromQueue(item.id)}
                                                        title="Remover da fila"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Visão Geral */}
                <div className="card card--compact">
                    <div className="card-header">
                        <h3 className="card-title">Visão Geral</h3>
                    </div>
                    <div className="card-body">
                        {summary ? (
                            <div className="summary-grid">
                                <div className="summary-row">
                                    <span className="summary-label">Total Filtrado</span>
                                    <span className="summary-value">{summary.totalInvoices} faturas</span>
                                </div>
                                <div className="summary-row">
                                    <span className="summary-label">Total Pendente</span>
                                    <span className="summary-value">R$ {formatCurrency((summary.totalOpenAmount || 0) + (summary.totalDelayedAmount || 0))}</span>
                                </div>
                                <div className="summary-row">
                                    <span className="summary-label">Total Pago</span>
                                    <span className="summary-value">R$ {formatCurrency(summary.totalPaidAmount || 0)}</span>
                                </div>
                                <p className="summary-subtitle" style={{ marginTop: '12px', fontSize: '0.65rem' }}>Detalhamento por Status</p>
                                <div className="status-list">
                                    {summary.byStatus?.map(s => (
                                        <div key={s.status} className="summary-row">
                                            <span className={`status-pill status-pill--${s.status.toLowerCase() === 'em aberto' ? 'pendente' : s.status.toLowerCase()}`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                                                {s.status}
                                            </span>
                                            <span className="summary-value">{s._count._all}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <p className="summary-label">Carregando...</p>}
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="dashboard-controls" style={{ marginBottom: '20px' }}>
                <div className="filters-grid">
                    <div className="field">
                        <label className="field-label">Empresa (CNPJ)</label>
                        <IMaskInput
                            mask="00.000.000/0000-00"
                            className="field-input"
                            placeholder="Buscar por CNPJ..."
                            value={filters.cnpj}
                            onAccept={(val) => setFilters(f => ({ ...f, cnpj: val }))}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Mês Referência</label>
                        <IMaskInput
                            mask="00/0000"
                            className="field-input"
                            placeholder="MM/AAAA"
                            value={filters.month}
                            unmask={false}
                            onAccept={(val) => setFilters(f => ({ ...f, month: val }))}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Unidade</label>
                        <CustomSelect
                            options={[{ label: 'Todas Unidades', value: '' }, ...units.map(u => ({ label: u.name, value: u.id }))]}
                            value={filters.unitId}
                            onChange={(val) => setFilters(f => ({ ...f, unitId: val }))}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Serviço/Contrato</label>
                        <input
                            className="field-input"
                            placeholder="Ex: Vivo Fibra..."
                            value={filters.service}
                            onChange={(e) => setFilters(f => ({ ...f, service: e.target.value }))}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Status do Pagamento</label>
                        <CustomSelect
                            options={[
                                { label: 'Todos os Status', value: '' },
                                { label: 'Pagas', value: 'PAGA' },
                                { label: 'Em Aberto (No Prazo)', value: 'ABERTA' },
                                { label: 'Atrasadas (Vencidas)', value: 'ATRASADA' },
                            ]}
                            value={filters.status}
                            onChange={(val) => setFilters(f => ({ ...f, status: val }))}
                        />
                    </div>
                </div>
            </div>

            {/* Tabela */}
            <div className="table-shell">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>
                                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Selecionar todas" />
                                </th>
                                <th>CNPJ</th>
                                <th>Empresa / Unidade</th>
                                <th>Serviço / Contrato</th>
                                <th>Vencimento</th>
                                <th>Mês Ref.</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr
                                    key={inv.id}
                                    onClick={(e) => {
                                        if (e.target.closest('button, a')) return;
                                        toggleSelect(inv.id);
                                    }}
                                    style={{ cursor: 'pointer' }}
                                    className={selectedIds.includes(inv.id) ? 'row-selected' : ''}
                                >
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(inv.id)}
                                            onChange={() => toggleSelect(inv.id)}
                                        />
                                    </td>
                                    <td className="table-cell-mono">{inv.cnpj || inv.company?.cnpj || '-'}</td>
                                    <td>
                                        <div className="table-cell-group">
                                            <div className="table-cell-main">{formatCompanyName(inv.company?.name)}</div>
                                            <div className="table-cell-sub">Unid: {inv.unit?.name || 'Não id.'}</div>
                                        </div>
                                    </td>
                                    <td>{displayService(inv)}</td>
                                    <td className="table-cell-mono">{new Date(inv.dueDate).toLocaleDateString('pt-BR')}</td>
                                    <td>{inv.referenceMonth}</td>
                                    <td className="table-cell-mono" style={{ fontWeight: 600 }}>R$ {formatCurrency(inv.totalAmount)}</td>
                                    <td>
                                        <span className={`status-pill status-pill--${getStatusClass(inv)}`}>
                                            {getStatusLabel(inv)}
                                        </span>
                                        {inv.status === 'PAGA' && inv.paidDate && (
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-soft)', marginTop: '2px' }}>
                                                Pago em: {new Date(inv.paidDate).toLocaleDateString('pt-BR')}
                                            </div>
                                        )}
                                    </td>
                                    <td className="table-actions">
                                        <div>
                                            {inv.status !== 'PAGA' && (
                                                <button
                                                    className="btn-table btn-table-pay"
                                                    onClick={() => handleOpenPaymentModal(inv)}
                                                    type="button"
                                                >
                                                    Pagar
                                                </button>
                                            )}
                                            <a href={`${BASE_URL}/${inv.pdfPath}`} target="_blank" rel="noreferrer" className="link-pdf">PDF</a>
                                            <button className="btn-table btn-table-delete" onClick={() => handleDelete(inv.id)} type="button">Excluir</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && invoices.length === 0 && (
                                <tr>
                                    <td colSpan="9" className="table-empty">Nenhuma fatura encontrada.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Barra de seleção */}
            {selectedIds.length > 0 && (
                <div className="selection-hint">
                    <div className="selection-hint-count">
                        {selectedIds.length} fatura{selectedIds.length > 1 ? 's' : ''} selecionada{selectedIds.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn btn-download-selected" onClick={handleDownloadSelected} type="button">
                            📦 Baixar Selecionadas (ZIP)
                        </button>
                        <button className="btn btn-danger" onClick={handleDeleteSelected} type="button">
                            🗑 Excluir Selecionadas
                        </button>
                    </div>
                </div>
            )}


            {/* Modal de Pagamento */}
            <ConfirmModal
                show={paymentModal.show}
                title="Registrar Pagamento"
                confirmText="Confirmar Pagamento"
                onConfirm={handleConfirmPayment}
                onCancel={() => setPaymentModal({ show: false, invoice: null, date: '' })}
                type="info"
                loading={loading}
            >
                <div className="payment-modal-content">
                    <div className="payment-info">
                        <div className="payment-info-row">
                            <span className="payment-info-label">Unidade:</span>
                            <span className="payment-info-value">{paymentModal.invoice?.unit?.name}</span>
                        </div>
                        <div className="payment-info-row">
                            <span className="payment-info-label">Referência:</span>
                            <span className="payment-info-value">{paymentModal.invoice?.referenceMonth}</span>
                        </div>
                        <div className="payment-info-row">
                            <span className="payment-info-label">Valor:</span>
                            <span className="payment-info-value">R$ {formatCurrency(paymentModal.invoice?.totalAmount)}</span>
                        </div>
                    </div>

                    <div className="payment-date-field">
                        <label>Data do Pagamento</label>
                        <input
                            type="date"
                            className="field-input"
                            value={paymentModal.date}
                            onChange={(e) => setPaymentModal(prev => ({ ...prev, date: e.target.value }))}
                        />
                    </div>
                </div>
            </ConfirmModal>
        </div>
    );
}
