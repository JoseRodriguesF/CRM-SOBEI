import { useEffect, useRef, useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL;

// ──────────────────────────────────────────────
// Toast System
// ──────────────────────────────────────────────
let _toastFn = null;

function ToastContainer({ onRegister }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  useEffect(() => {
    const fn = (message, type = 'info') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      timers.current[id] = setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
        delete timers.current[id];
      }, 4000);
    };
    onRegister(fn);
    return () => Object.values(timers.current).forEach(clearTimeout);
  }, [onRegister]);

  function dismiss(id) {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function toast(message, type = 'info') {
  if (_toastFn) _toastFn(message, type);
}

// ──────────────────────────────────────────────
// Confirm Modal
// ──────────────────────────────────────────────
function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-box modal-box--sm">
        <div className="confirm-modal-body">
          <div className={`confirm-icon ${danger ? 'confirm-icon--danger' : 'confirm-icon--info'}`}>
            {danger ? '⚠' : '?'}
          </div>
          <h3 className="confirm-title">{title}</h3>
          <p className="confirm-message">{message}</p>
        </div>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function useConfirm() {
  const [state, setState] = useState({ open: false, resolve: null, props: {} });

  function confirm(props) {
    return new Promise((resolve) => {
      setState({ open: true, resolve, props });
    });
  }

  function handleConfirm() {
    state.resolve(true);
    setState({ open: false, resolve: null, props: {} });
  }

  function handleCancel() {
    state.resolve(false);
    setState({ open: false, resolve: null, props: {} });
  }

  const modal = (
    <ConfirmModal
      open={state.open}
      {...state.props}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, modal };
}

// ──────────────────────────────────────────────
// Página de Unidades
// ──────────────────────────────────────────────
function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, modal: confirmModal } = useConfirm();

  const emptyForm = { name: '', cnpj: '', address: '', contracts: '', companyCnpj: '', companyName: '' };
  const [form, setForm] = useState(emptyForm);

  async function fetchUnits() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/units`);
      if (!res.ok) throw new Error('Erro ao carregar unidades.');
      setUnits(await res.json());
    } catch (e) {
      toast(e.message || 'Erro ao carregar unidades.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUnits(); }, []);

  function openCreate() {
    setEditingUnit(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(unit) {
    setEditingUnit(unit);
    setForm({
      name: unit.name || '',
      cnpj: unit.cnpj || '',
      address: unit.address || '',
      contracts: unit.contracts || '',
      companyCnpj: unit.company?.cnpj || '',
      companyName: unit.company?.name || '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingUnit(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('Nome da unidade é obrigatório.', 'error');
      return;
    }
    if (!editingUnit && !form.companyCnpj.trim()) {
      toast('CNPJ da empresa é obrigatório.', 'error');
      return;
    }
    setSaving(true);
    try {
      let res;
      if (editingUnit) {
        res = await fetch(`${API_URL}/units/${editingUnit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            cnpj: form.cnpj || null,
            address: form.address || null,
            contracts: form.contracts || null,
          }),
        });
      } else {
        res = await fetch(`${API_URL}/units`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            cnpj: form.cnpj || null,
            address: form.address || null,
            contracts: form.contracts || null,
            companyCnpj: form.companyCnpj,
            companyName: form.companyName || null,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar unidade.');

      toast(editingUnit ? 'Unidade atualizada com sucesso.' : 'Unidade cadastrada com sucesso.', 'success');
      await fetchUnits();
      closeForm();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(unit) {
    const ok = await confirm({
      title: 'Excluir unidade',
      message: `Tem certeza que deseja excluir "${unit.name}"? As faturas vinculadas serão desvinculadas mas não excluídas.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;

    setDeletingId(unit.id);
    try {
      const res = await fetch(`${API_URL}/units/${unit.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir unidade.');
      toast('Unidade excluída com sucesso.', 'success');
      await fetchUnits();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="units-page">
      {confirmModal}

      <div className="units-header">
        <p className="units-count">
          {loading ? 'Carregando...' : `${units.length} unidade${units.length !== 1 ? 's' : ''} cadastrada${units.length !== 1 ? 's' : ''}`}
        </p>
        <button className="btn btn-primary" onClick={openCreate}>+ Nova unidade</button>
      </div>

      {/* Modal de formulário */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingUnit ? `Editar: ${editingUnit.name}` : 'Cadastrar nova unidade'}
              </h3>
              <button className="modal-close" onClick={closeForm} aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="unit-form">
              <div className="unit-form-grid">
                <div className="field field--full">
                  <label className="field-label">Nome da unidade <span className="field-required">*</span></label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Ex: Filial São Paulo Centro"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>

                <div className="field">
                  <label className="field-label">CNPJ da unidade</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="00.000.000/0001-00"
                    value={form.cnpj}
                    onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                  />
                  <span className="field-hint">Usado para vincular faturas automaticamente</span>
                </div>

                {!editingUnit && (
                  <div className="field">
                    <label className="field-label">CNPJ da empresa (matriz) <span className="field-required">*</span></label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="00.000.000/0001-00"
                      value={form.companyCnpj}
                      onChange={(e) => setForm((f) => ({ ...f, companyCnpj: e.target.value }))}
                      required={!editingUnit}
                    />
                  </div>
                )}

                {!editingUnit && (
                  <div className="field">
                    <label className="field-label">Nome da empresa (se nova)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Razão social ou nome fantasia"
                      value={form.companyName}
                      onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    />
                    <span className="field-hint">Deixe vazio se a empresa já existir</span>
                  </div>
                )}

                <div className="field field--full">
                  <label className="field-label">Endereço completo</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Rua, número, bairro, cidade – Estado, CEP"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                  <span className="field-hint">Deve ser idêntico ao endereço nas faturas desta unidade</span>
                </div>

                <div className="field field--full">
                  <label className="field-label">Contratos / números de contrato</label>
                  <textarea
                    className="field-textarea"
                    placeholder="Ex: Contrato móvel 12345678, Dados 87654321, Fixo 11223344"
                    value={form.contracts}
                    onChange={(e) => setForm((f) => ({ ...f, contracts: e.target.value }))}
                    rows={3}
                  />
                  <span className="field-hint">A IA usará esses dados para vincular faturas automaticamente</span>
                </div>
              </div>

              <div className="unit-form-info">
                <div className="info-box">
                  <span className="info-icon">🤖</span>
                  <span>A IA extrai o <strong>CNPJ</strong>, <strong>endereço</strong> e <strong>contratos</strong> das faturas e compara com os dados aqui cadastrados para vincular automaticamente.</span>
                </div>
              </div>

              <div className="unit-form-actions">
                <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : editingUnit ? 'Salvar alterações' : 'Cadastrar unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="units-loading">Carregando unidades...</div>
      ) : units.length === 0 ? (
        <div className="units-empty">
          <div className="units-empty-icon">🏢</div>
          <p className="units-empty-title">Nenhuma unidade cadastrada</p>
          <p className="units-empty-sub">
            Cadastre unidades para que a IA vincule faturas automaticamente pelo CNPJ, endereço ou número de contrato.
          </p>
          <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: 16 }}>
            Cadastrar primeira unidade
          </button>
        </div>
      ) : (
        <div className="units-grid">
          {units.map((unit) => (
            <div key={unit.id} className="unit-card">
              <div className="unit-card-top">
                <div className="unit-card-icon">🏢</div>
                <div className="unit-card-info">
                  <h3 className="unit-card-name">{unit.name}</h3>
                  <span className="unit-card-company">{unit.company?.name || '—'}</span>
                </div>
              </div>
              <div className="unit-card-fields">
                {unit.cnpj && (
                  <div className="unit-field-row">
                    <span className="unit-field-key">CNPJ</span>
                    <span className="unit-field-val unit-field-mono">{unit.cnpj}</span>
                  </div>
                )}
                {unit.address && (
                  <div className="unit-field-row">
                    <span className="unit-field-key">Endereço</span>
                    <span className="unit-field-val">{unit.address}</span>
                  </div>
                )}
                {unit.contracts && (
                  <div className="unit-field-row">
                    <span className="unit-field-key">Contratos</span>
                    <span className="unit-field-val">{unit.contracts}</span>
                  </div>
                )}
                {!unit.cnpj && !unit.address && !unit.contracts && (
                  <p className="unit-no-data">Sem dados de identificação. Edite para adicionar CNPJ, endereço ou contratos.</p>
                )}
              </div>
              <div className="unit-card-match-badge">
                <span className={`match-badge ${unit.cnpj || unit.address || unit.contracts ? 'match-badge--active' : 'match-badge--missing'}`}>
                  {unit.cnpj || unit.address || unit.contracts ? '✓ Vinculação automática configurada' : '⚠ Dados de matching ausentes'}
                </span>
              </div>
              <div className="unit-card-actions">
                <button className="btn btn-outline-sm" onClick={() => openEdit(unit)}>Editar</button>
                <button
                  className="btn btn-danger-sm"
                  onClick={() => handleDelete(unit)}
                  disabled={deletingId === unit.id}
                >
                  {deletingId === unit.id ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// App Principal
// ──────────────────────────────────────────────
function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [file, setFile] = useState(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [filters, setFilters] = useState({ cnpj: '', status: '', month: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailData, setEmailData] = useState({ to: '', subject: '' });
  const [dashboard, setDashboard] = useState(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [homeFilters, setHomeFilters] = useState({ month: '', unitId: '' });
  const [homeDashboard, setHomeDashboard] = useState(null);
  const [units, setUnits] = useState([]);
  const { confirm, modal: confirmModal } = useConfirm();

  const registerToast = (fn) => { _toastFn = fn; };

  async function fetchUnits() {
    try {
      const res = await fetch(`${API_URL}/units`);
      if (res.ok) setUnits(await res.json());
    } catch (e) { console.error(e); }
  }

  async function fetchInvoices() {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (filters.cnpj) params.append('cnpj', filters.cnpj);
      if (filters.status) params.append('status', filters.status);
      if (filters.month) params.append('month', filters.month);

      const res = await fetch(`${API_URL}/invoices?${params.toString()}`);
      if (!res.ok) throw new Error('Erro ao carregar faturas.');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error(await res.text() || 'Resposta inválida da API.');
      setInvoices(await res.json());
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoadingList(false);
    }
  }

  async function fetchDashboard() {
    try {
      const res = await fetch(`${API_URL}/invoices/dashboard`);
      if (!res.ok) return;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      setDashboard(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchHomeDashboard() {
    try {
      const params = new URLSearchParams();
      if (homeFilters.month) params.append('month', homeFilters.month);
      if (homeFilters.unitId) params.append('unitId', homeFilters.unitId);

      const res = await fetch(`${API_URL}/invoices/dashboard?${params.toString()}`);
      if (!res.ok) return;
      setHomeDashboard(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchInvoices();
    fetchDashboard();
    fetchUnits();
  }, []);

  useEffect(() => {
    fetchHomeDashboard();
  }, [homeFilters]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) { toast('Selecione um PDF primeiro.', 'error'); return; }
    setLoadingUpload(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/invoices/upload`, { method: 'POST', body: formData });

      let errorMsg = 'Erro no upload';
      if (!res.ok) {
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const err = await res.json();
            errorMsg = err.error || errorMsg;
            if (err.details) errorMsg += ` (${err.details})`;
          } else {
            const text = await res.text();
            if (text) errorMsg = text;
          }
        } catch { /* mantém mensagem padrão */ }
        throw new Error(errorMsg);
      }

      await fetchInvoices();
      await fetchDashboard();
      setFile(null);
      e.target.reset();
      toast('Fatura enviada e processada com sucesso.', 'success');
    } catch (error) {
      toast('Erro ao enviar fatura: ' + error.message, 'error');
    } finally {
      setLoadingUpload(false);
    }
  }

  async function handleDeleteInvoice(inv) {
    const ok = await confirm({
      title: 'Excluir fatura',
      message: `Deseja excluir a fatura de ${inv.referenceMonth} — ${inv.company?.name}? O arquivo PDF também será removido.`,
      confirmLabel: 'Excluir fatura',
      danger: true,
    });
    if (!ok) return;

    setDeletingInvoiceId(inv.id);
    try {
      const res = await fetch(`${API_URL}/invoices/${inv.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir fatura.');
      toast('Fatura excluída com sucesso.', 'success');
      setSelectedIds((ids) => ids.filter((x) => x !== inv.id));
      await fetchInvoices();
      await fetchDashboard();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  async function handleUpdateStatus(inv, newStatus) {
    if (inv.status === newStatus) return;
    setUpdatingStatusId(inv.id);
    try {
      const res = await fetch(`${API_URL}/invoices/${inv.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar status.');
      toast(`Status atualizado para ${newStatus}.`, 'success');
      setInvoices((list) => list.map((x) => (x.id === inv.id ? { ...x, status: newStatus } : x)));
      await fetchDashboard();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === invoices.length && invoices.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(invoices.map((i) => i.id));
    }
  }

  async function handleSendEmail(e) {
    e.preventDefault();
    if (!selectedIds.length) { toast('Selecione ao menos uma fatura.', 'error'); return; }
    if (!emailData.to) { toast('Informe o e-mail de destino.', 'error'); return; }
    try {
      const res = await fetch(`${API_URL}/invoices/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: selectedIds, ...emailData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.');
      toast('E-mail enviado com sucesso.', 'success');
    } catch (error) {
      toast('Erro ao enviar e-mail: ' + error.message, 'error');
    }
  }

  const now = new Date();
  const currentRef = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const invoicesCurrentMonth = invoices.filter((inv) => inv.referenceMonth === currentRef);
  const statsCurrentMonth = invoicesCurrentMonth.reduce(
    (acc, inv) => {
      acc.total += 1;
      if (inv.status === 'PAGA') acc.pagas += 1;
      else if (inv.status === 'ATRASADA') acc.atrasadas += 1;
      else acc.abertas += 1;
      return acc;
    },
    { total: 0, pagas: 0, abertas: 0, atrasadas: 0 },
  );

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;

  return (
    <div className="app-shell">
      <ToastContainer onRegister={registerToast} />
      {confirmModal}

      <div className="top-bar-shell">
        <div className="top-bar">
          <div className="top-bar-left">
            <div className="top-bar-title-group">
              <span className="top-bar-title">CRM SOBEI</span>
              <span className="top-bar-subtitle">Monitor de faturas Vivo Empresas · IA ligada</span>
            </div>
          </div>
          <div className="top-bar-right">
            <div className="top-nav">
              {['home', 'invoices', 'units'].map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`top-nav-item ${currentPage === page ? 'top-nav-item--active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page === 'home' ? 'Início' : page === 'invoices' ? 'Faturas' : 'Unidades'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="app-container">
        <header className="app-header">
          <div>
            {currentPage === 'home' && (
              <>
                <h1 className="app-title">Início</h1>
                <p className="app-subtitle">Visão geral das faturas do mês atual, status e indicadores rápidos para o financeiro.</p>
              </>
            )}
            {currentPage === 'invoices' && (
              <>
                <h1 className="app-title">Faturas</h1>
                <p className="app-subtitle">Upload de PDFs, extração automática por IA e gestão detalhada das faturas.</p>
              </>
            )}
            {currentPage === 'units' && (
              <>
                <h1 className="app-title">Unidades</h1>
                <p className="app-subtitle">Cadastre unidades com CNPJ, endereço e contratos. A IA usará esses dados para vincular faturas automaticamente às unidades corretas.</p>
              </>
            )}
          </div>
        </header>

        {/* ── HOME ── */}
        {currentPage === 'home' && (
          <section className="dashboard-layout">
            <div className="dashboard-controls">
              <div className="filters-grid filters-grid--compact">
                <div className="field">
                  <label className="field-label">Filtrar por Mês</label>
                  <input
                    type="text"
                    value={homeFilters.month}
                    onChange={(e) => setHomeFilters(f => ({ ...f, month: e.target.value }))}
                    placeholder="MM/AAAA"
                    className="field-input"
                  />
                </div>
                <div className="field">
                  <label className="field-label">Filtrar por Unidade</label>
                  <select
                    value={homeFilters.unitId}
                    onChange={(e) => setHomeFilters(f => ({ ...f, unitId: e.target.value }))}
                    className="field-select"
                  >
                    <option value="">Todas as unidades</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="dashboard-grid">
              {/* Card de Faturas em Aberto */}
              <div className="card dashboard-card dashboard-card--highlight">
                <div className="card-header">
                  <h2 className="card-title">Faturas em Aberto</h2>
                </div>
                <div className="card-body">
                  <div className="highlight-value">
                    <span className="currency">R$</span>
                    {Number(homeDashboard?.totalOpenAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="highlight-subtitle">Total acumulado a pagar</p>
                </div>
              </div>

              {/* Card de Gráfico em Pizza */}
              <div className="card dashboard-card">
                <div className="card-header">
                  <h2 className="card-title">Distribuição por Status</h2>
                </div>
                <div className="card-body" style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={homeDashboard?.byStatus?.map(s => ({ name: s.status, value: s._count._all })) || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {homeDashboard?.byStatus?.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.status === 'PAGA' ? '#22c55e' :
                                entry.status === 'ATRASADA' ? '#f43f5e' : '#eab308'
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '8px' }}
                        itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Card de Vencimentos */}
              <div className="card dashboard-card">
                <div className="card-header">
                  <h2 className="card-title">Próximos Vencimentos</h2>
                </div>
                <div className="card-body">
                  <div className="due-list">
                    <p className="due-list-title">Vencimentos:</p>
                    {homeDashboard?.dueDays?.length > 0 ? (
                      homeDashboard.dueDays.map(item => (
                        <div key={item.day} className="due-item">
                          <span className="due-day">dia {item.day}</span>
                          <span className="due-sep">—</span>
                          <span className="due-count">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <p className="empty-msg">Nenhum vencimento encontrado.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── FATURAS ── */}
        {currentPage === 'invoices' && (
          <>
            <section className="layout-main">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Upload de fatura (PDF)</h2>
                </div>
                <form onSubmit={handleUpload} className="upload-form">
                  <label className="file-input-wrapper">
                    <span className="file-input-label">Selecione o arquivo PDF</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="file-input"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button type="submit" disabled={loadingUpload} className="btn btn-primary">
                    {loadingUpload ? 'Processando...' : 'Enviar PDF'}
                  </button>
                </form>
              </div>

              <div className="card card--compact">
                <div className="card-header"><h2 className="card-title">Visão geral</h2></div>
                <div className="card-body">
                  {dashboard ? (
                    <div className="summary-grid">
                      <div className="summary-row"><span className="summary-label">Total de faturas</span><span className="summary-value">{dashboard.totalInvoices}</span></div>
                      <div className="summary-row"><span className="summary-label">Valor total</span><span className="summary-value">R$ {Number(dashboard.totalAmount || 0).toFixed(2)}</span></div>
                      <div>
                        <p className="summary-subtitle">Por status</p>
                        <div className="status-list">
                          {dashboard.byStatus?.map((item) => (
                            <div key={item.status} className="summary-row">
                              <span className="summary-label">{item.status}</span>
                              <span className="summary-value">{item._count._all}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="summary-label">Carregando informações...</p>
                  )}
                </div>
              </div>
            </section>

            <section className="filters-card">
              <div className="filters-layout">
                <div className="filters-grid">
                  <div className="field">
                    <label className="field-label">CNPJ</label>
                    <input type="text" value={filters.cnpj} onChange={(e) => setFilters((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" className="field-input" />
                  </div>
                  <div className="field">
                    <label className="field-label">Mês de referência</label>
                    <input type="text" value={filters.month} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))} placeholder="MM/AAAA" className="field-input" />
                  </div>
                  <div className="field">
                    <label className="field-label">Status</label>
                    <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="field-select">
                      <option value="">Todos</option>
                      <option value="PAGA">Paga</option>
                      <option value="PENDENTE">Pendente</option>
                      <option value="ATRASADA">Atrasada</option>
                    </select>
                  </div>
                </div>
                <button onClick={fetchInvoices} className="btn btn-secondary">{loadingList ? 'Atualizando...' : 'Aplicar filtros'}</button>
              </div>

              <div className="table-shell" style={{ marginTop: 14 }}>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            title="Selecionar todas"
                          />
                        </th>
                        <th>CNPJ</th>
                        <th>Empresa / Unidade</th>
                        <th>Mês</th>
                        <th>Vencimento</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const statusClass =
                          inv.status === 'PAGA' ? 'status-pill--paga'
                            : inv.status === 'ATRASADA' ? 'status-pill--atrasada'
                              : 'status-pill--pendente';
                        const isDeleting = deletingInvoiceId === inv.id;
                        const isUpdating = updatingStatusId === inv.id;

                        return (
                          <tr key={inv.id} className={isDeleting ? 'row--deleting' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(inv.id)}
                                onChange={() => toggleSelect(inv.id)}
                                disabled={isDeleting}
                              />
                            </td>
                            <td className="table-cell-mono">{inv.cnpj}</td>
                            <td>
                              <div>{inv.company?.name}</div>
                              <div className="table-cell-secondary">{inv.unit?.name || <span className="no-unit-badge">Sem unidade</span>}</div>
                            </td>
                            <td>{inv.referenceMonth}</td>
                            <td>{(() => {
                              if (!inv.dueDate) return '—';
                              const [y, m, d] = inv.dueDate.split('T')[0].split('-');
                              return `${d}/${m}/${y}`;
                            })()}</td>
                            <td>R$ {Number(inv.totalAmount).toFixed(2)}</td>
                            <td>
                              <select
                                className={`status-select status-select--${inv.status.toLowerCase()}`}
                                value={inv.status}
                                onChange={(e) => handleUpdateStatus(inv, e.target.value)}
                                disabled={isUpdating || isDeleting}
                                title="Alterar status"
                              >
                                <option value="PAGA">PAGA</option>
                                <option value="PENDENTE">PENDENTE</option>
                                <option value="ATRASADA">ATRASADA</option>
                              </select>
                            </td>
                            <td>
                              <div className="table-actions">
                                <a
                                  href={`${API_URL.replace('/api', '')}/${inv.pdfPath}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="link-minimal"
                                >
                                  PDF
                                </a>
                                <button
                                  className="btn-table-delete"
                                  onClick={() => handleDeleteInvoice(inv)}
                                  disabled={isDeleting}
                                  title="Excluir fatura"
                                >
                                  {isDeleting ? '...' : '🗑'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!invoices.length && (
                        <tr>
                          <td colSpan={8} className="table-empty">
                            Nenhuma fatura encontrada. Faça o upload de um PDF ou ajuste os filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedIds.length > 0 && (
                <p className="selection-hint">{selectedIds.length} fatura{selectedIds.length !== 1 ? 's' : ''} selecionada{selectedIds.length !== 1 ? 's' : ''}</p>
              )}
            </section>

            <section className="email-card">
              <div className="card-header">
                <h2 className="card-title">Enviar e-mail com faturas selecionadas</h2>
              </div>
              <form onSubmit={handleSendEmail} className="email-layout">
                <div className="field">
                  <label className="field-label">Para (e-mail)</label>
                  <input type="email" value={emailData.to} onChange={(e) => setEmailData((d) => ({ ...d, to: e.target.value }))} className="field-input" placeholder="contas@empresa.com.br" />
                </div>
                <div className="field">
                  <label className="field-label">Assunto</label>
                  <input type="text" value={emailData.subject} onChange={(e) => setEmailData((d) => ({ ...d, subject: e.target.value }))} className="field-input" placeholder="Faturas Vivo Empresas" />
                </div>
                <div>
                  <button type="submit" className="btn btn-accent" disabled={!selectedIds.length}>Enviar e-mail</button>
                </div>
              </form>
              <p className="email-helper">O sistema anexará automaticamente os PDFs das faturas selecionadas e incluirá um resumo com valores e lista de pendentes/atrasadas.</p>
            </section>
          </>
        )}

        {/* ── UNIDADES ── */}
        {currentPage === 'units' && <UnitsPage />}
      </div>
    </div>
  );
}

export default App;
