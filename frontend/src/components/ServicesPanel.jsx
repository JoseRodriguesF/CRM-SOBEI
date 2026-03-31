import { useState, useCallback } from 'react';
import { api } from '../api';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', contractNumber: '' };

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Painel interno ao card da unidade para gerenciar serviços (Nome e Contrato).
 */
export function ServicesPanel({ unit, onUpdate, addToast }) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(false);

    const resetForm = useCallback(() => {
        setForm(EMPTY_FORM);
        setIsAdding(false);
        setEditingId(null);
    }, []);

    const startEdit = useCallback((svc) => {
        setForm({ name: svc.name, contractNumber: svc.contractNumber });
        setEditingId(svc.id);
        setIsAdding(false);
    }, []);

    const handleSave = useCallback(async (e) => {
        e.preventDefault();
        if (!form.name || !form.contractNumber) return;
        setLoading(true);

        try {
            if (editingId) {
                await api.units.services.update(unit.id, editingId, form);
                addToast('Serviço atualizado!', 'success');
            } else {
                await api.units.services.create(unit.id, form);
                addToast('Serviço adicionado!', 'success');
            }
            resetForm();
            onUpdate();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [form, editingId, unit.id, addToast, resetForm, onUpdate]);

    const handleDelete = useCallback(async (svcId) => {
        if (!window.confirm('Excluir este serviço?')) return;
        setLoading(true);
        try {
            await api.units.services.delete(unit.id, svcId);
            addToast('Serviço removido.', 'info');
            onUpdate();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [unit.id, addToast, onUpdate]);

    return (
        <div className="services-panel">
            <div className="services-panel-header">
                <h4 className="services-panel-title">Serviços Cadastrados</h4>
                {!isAdding && !editingId && (
                    <button className="btn btn-outline-sm" onClick={() => setIsAdding(true)}>
                        + Novo Serviço
                    </button>
                )}
            </div>

            {(isAdding || editingId) && (
                <form className="service-form-inline" onSubmit={handleSave}>
                    <div className="service-form-row">
                        <div className="field">
                            <label className="field-label">Nome do Serviço</label>
                            <input
                                className="field-input"
                                placeholder="Ex: Móvel, Fibra..."
                                value={form.name}
                                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Nº Contrato</label>
                            <input
                                className="field-input"
                                placeholder="Ex: 89901234"
                                value={form.contractNumber}
                                onChange={(e) => setForm(f => ({ ...f, contractNumber: e.target.value }))}
                                required
                            />
                        </div>
                    </div>
                    <div className="service-form-actions">
                        <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Salvando...' : editingId ? 'Salvar' : 'Adicionar'}
                        </button>
                    </div>
                </form>
            )}

            <div className="services-list">
                {unit.services?.length === 0 && !isAdding && (
                    <p className="services-empty">Nenhum serviço cadastrado para esta unidade.</p>
                )}
                {unit.services?.map((svc) => (
                    <div key={svc.id} className="service-item">
                        <div className="service-item-info">
                            <span className="service-item-name">{svc.name}</span>
                            <span className="service-item-contract">Contrato: <strong>{svc.contractNumber}</strong></span>
                        </div>
                        <div className="service-item-actions">
                            <button className="btn-outline-sm" onClick={() => startEdit(svc)}>Editar</button>
                            <button className="btn-danger-sm" onClick={() => handleDelete(svc.id)}>Excluir</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
