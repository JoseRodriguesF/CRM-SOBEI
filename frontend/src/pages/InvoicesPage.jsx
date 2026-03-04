import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { CustomSelect } from '../components/CustomSelect';
import { IMaskInput } from 'react-imask';

export function InvoicesPage({ addToast }) {
    const [invoices, setInvoices] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);

    // Email State (Mais completo conforme pedido)
    const [emailData, setEmailData] = useState({
        to: '',
        subject: 'Faturas Vivo Empresas'
    });

    // Selection State (Restaurado)
    const [selectedIds, setSelectedIds] = useState([]);

    // Summary State (Visão Geral restaurada)
    const [summary, setSummary] = useState(null);

    const [filters, setFilters] = useState({
        cnpj: '',
        month: '',
        status: '',
        unitId: '',
        service: ''
    });

    useEffect(() => {
        loadInvoices();
        loadUnits();
        loadSummary();
    }, [filters]);

    const loadUnits = async () => {
        try {
            const data = await api.units.list();
            setUnits(data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadSummary = async () => {
        try {
            const data = await api.invoices.dashboard(filters);
            setSummary(data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const data = await api.invoices.list(filters);
            setInvoices(data);
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        addToast('Analisando fatura via IA...', 'info');

        try {
            const newInvoice = await api.invoices.upload(file);
            // Ao invés de concatenar, recarregamos para manter ordem e filtros
            await loadInvoices();
            addToast('Fatura processada com sucesso!', 'success');
            loadSummary();

            if (!newInvoice.unitId) {
                addToast('Aviso: Unidade não identificada automaticamente.', 'info');
            }
        } catch (err) {
            addToast(`Erro: ${err.message}`, 'error');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Excluir esta fatura permanentemente?')) return;
        try {
            await api.invoices.delete(id);
            setInvoices(invoices.filter(i => i.id !== id));
            setSelectedIds(selectedIds.filter(sid => sid !== id));
            addToast('Fatura excluída.', 'info');
            loadSummary();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            const updated = await api.invoices.updateStatus(id, newStatus);
            setInvoices(invoices.map(i => i.id === id ? updated : i));
            addToast('Status atualizado.', 'success');
            loadSummary();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const handleSendEmail = async () => {
        if (!emailData.to) return addToast('Informe o e-mail de destino.', 'error');
        if (selectedIds.length === 0) return addToast('Selecione pelo menos uma fatura na tabela abaixo.', 'warning');

        setSendingEmail(true);
        try {
            await api.invoices.sendEmail({
                invoiceIds: selectedIds,
                to: emailData.to,
                subject: emailData.subject
            });
            addToast('Relatório e anexos enviados!', 'success');
            setSelectedIds([]);
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setSendingEmail(false);
        }
    };

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(sid => sid !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === invoices.length && invoices.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(invoices.map(i => i.id));
        }
    };

    const getStatusClass = (inv) => {
        if (inv.status === 'PAGA') return 'paga';
        const due = new Date(inv.dueDate);
        return due < new Date() ? 'atrasada' : 'pendente';
    };

    const displayService = (inv) => {
        const name = inv.service?.name || inv.serviceName || '-';
        const hasContract = inv.service?.contractNumber;
        return (
            <div className="table-cell-group">
                <div className="table-cell-main">{name}</div>
                {hasContract && <div className="table-cell-sub">Contrato: {inv.service.contractNumber}</div>}
            </div>
        );
    };

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
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                />
                            </label>
                            <button className="btn btn-primary" disabled={uploading}>
                                {uploading ? 'Processando...' : 'Analisar PDF'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Visão Geral Card (Restaurado) */}
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
                                    <span className="summary-value">R$ {((summary.totalOpenAmount || 0) + (summary.totalDelayedAmount || 0)).toFixed(2)}</span>
                                </div>
                                <div className="summary-row">
                                    <span className="summary-label">Total Pago</span>
                                    <span className="summary-value">R$ {(summary.totalPaidAmount || 0).toFixed(2)}</span>
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

            {/* Filters Section - Estilização Melhorada */}
            <div className="dashboard-controls" style={{ marginBottom: '20px' }}>
                <div className="filters-grid">
                    <div className="field">
                        <label className="field-label">Empresa (CNPJ)</label>
                        <IMaskInput
                            mask="00.000.000/0000-00"
                            className="field-input"
                            placeholder="Buscar por CNPJ..."
                            value={filters.cnpj}
                            onAccept={(val) => setFilters({ ...filters, cnpj: val })}
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
                            onAccept={(val) => setFilters({ ...filters, month: val })}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Unidade</label>
                        <CustomSelect
                            options={[{ label: 'Todas Unidades', value: '' }, ...units.map(u => ({ label: u.name, value: u.id }))]}
                            value={filters.unitId}
                            onChange={(val) => setFilters({ ...filters, unitId: val })}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Serviço/Contrato</label>
                        <input
                            className="field-input"
                            placeholder="Ex: Vivo Fibra..."
                            value={filters.service}
                            onChange={(e) => setFilters({ ...filters, service: e.target.value })}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Status do Pagamento</label>
                        <CustomSelect
                            options={[
                                { label: 'Todos os Status', value: '' },
                                { label: 'Pagas', value: 'PAGA' },
                                { label: 'Em Aberto (No Prazo)', value: 'ABERTA' },
                                { label: 'Atrasadas (Vencidas)', value: 'ATRASADA' }
                            ]}
                            value={filters.status}
                            onChange={(val) => setFilters({ ...filters, status: val })}
                        />
                    </div>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="table-shell">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        title="Selecionar todas"
                                    />
                                </th>
                                <th>CNPJ</th>
                                <th>Empresa / Unidade</th>
                                <th>Serviço / Contrato</th>
                                <th>Vencimento</th>
                                <th>Mês Ref.</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr key={inv.id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(inv.id)}
                                            onChange={() => toggleSelect(inv.id)}
                                        />
                                    </td>
                                    <td className="table-cell-mono">{inv.cnpj || inv.company?.cnpj || '-'}</td>
                                    <td>
                                        <div className="table-cell-group">
                                            <div className="table-cell-main">{inv.company?.name}</div>
                                            <div className="table-cell-sub">Unid: {inv.unit?.name || 'Não id.'}</div>
                                        </div>
                                    </td>
                                    <td>{displayService(inv)}</td>
                                    <td className="table-cell-mono">{new Date(inv.dueDate).toLocaleDateString()}</td>
                                    <td>{inv.referenceMonth}</td>
                                    <td className="table-cell-mono" style={{ fontWeight: 600 }}>R$ {Number(inv.totalAmount).toFixed(2)}</td>
                                    <td>
                                        <span className={`status-pill status-pill--${getStatusClass(inv)}`}>
                                            {inv.status === 'ABERTA' && new Date(inv.dueDate) < new Date() ? 'ATRASADA' : (inv.status === 'ABERTA' ? 'EM ABERTO' : inv.status)}
                                        </span>
                                    </td>
                                    <td className="table-actions">
                                        <a href={`${import.meta.env.VITE_API_URL.replace('/api', '')}/${inv.pdfPath}`} target="_blank" className="link-minimal">PDF</a>
                                        <button className="btn-table-delete" onClick={() => handleDelete(inv.id)}>🗑</button>
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

            {selectedIds.length > 0 && (
                <div className="selection-hint" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {selectedIds.length} fatura{selectedIds.length > 1 ? 's' : ''} selecionada{selectedIds.length > 1 ? 's' : ''}
                </div>
            )}

            {/* Email Card (Fixado na parte inferior conforme pedido) */}
            <div className="card email-card">
                <div className="card-header">
                    <h3 className="card-title">Enviar E-mail com Selecionadas</h3>
                </div>
                <div className="card-body">
                    <div className="email-layout">
                        <div className="field">
                            <label className="field-label">Para (Destinatário)</label>
                            <input
                                type="email"
                                className="field-input"
                                placeholder="exemplo@email.com"
                                value={emailData.to}
                                onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Assunto</label>
                            <input
                                type="text"
                                className="field-input"
                                placeholder="Assunto do e-mail"
                                value={emailData.subject}
                                onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                            />
                        </div>
                        <button
                            className="btn btn-accent"
                            onClick={handleSendEmail}
                            disabled={sendingEmail || selectedIds.length === 0}
                        >
                            {sendingEmail ? 'Enviando...' : 'Enviar Selecionadas'}
                        </button>
                    </div>
                    <p className="email-helper">Anexa automaticamente os PDFs e o resumo das faturas marcadas na tabela.</p>
                </div>
            </div>
        </div>
    );
}
