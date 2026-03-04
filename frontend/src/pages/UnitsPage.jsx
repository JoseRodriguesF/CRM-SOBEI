import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { MultiCnpjInput } from '../components/MultiCnpjInput';
import { ServicesPanel } from '../components/ServicesPanel';
import { ConfirmModal } from '../components/ConfirmModal';
import { IMaskInput } from 'react-imask';

export function UnitsPage({ addToast }) {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [expandedUnit, setExpandedUnit] = useState(null);
    const [editingUnit, setEditingUnit] = useState(null);

    const [form, setForm] = useState({
        name: '',
        cnpjs: [],
        address: '',
        companyCnpj: '',
        companyName: ''
    });

    const [confirmDelete, setConfirmDelete] = useState({ show: false, unitId: null, unitName: '' });

    useEffect(() => {
        loadUnits();
    }, []);

    const loadUnits = async () => {
        setLoading(true);
        try {
            const data = await api.units.list();
            setUnits(data);
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreate = () => {
        setEditingUnit(null);
        setForm({ name: '', cnpjs: [], address: '', companyCnpj: '', companyName: '' });
        setShowModal(true);
    };

    const handleOpenEdit = (unit) => {
        setEditingUnit(unit);
        setForm({
            name: unit.name,
            cnpjs: unit.cnpjs || [],
            address: unit.address || '',
            companyCnpj: unit.company?.cnpj || '',
            companyName: unit.company?.name || ''
        });
        setShowModal(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (editingUnit) {
                await api.units.update(editingUnit.id, form);
                addToast('Unidade atualizada com sucesso!', 'success');
            } else {
                await api.units.create(form);
                addToast('Unidade criada com sucesso!', 'success');
            }
            setShowModal(false);
            loadUnits();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const handleConfirmDelete = async () => {
        try {
            await api.units.delete(confirmDelete.unitId);
            addToast('Unidade removida.', 'info');
            setConfirmDelete({ show: false, unitId: null, unitName: '' });
            loadUnits();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    return (
        <div className="units-page">
            <div className="units-header">
                <div className="top-bar-title-group">
                    <h2 className="app-title">Unidades</h2>
                    <p className="units-count">{units.length} unidades cadastradas</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenCreate}>
                    + Nova Unidade
                </button>
            </div>

            {loading && units.length === 0 ? (
                <div className="units-loading">Carregando unidades...</div>
            ) : units.length === 0 ? (
                <div className="units-empty">
                    <div className="units-empty-icon">🏢</div>
                    <h3 className="units-empty-title">Nenhuma unidade encontrada</h3>
                    <p className="units-empty-sub">Crie sua primeira unidade e adicione os serviços para começar o controle.</p>
                    <button className="btn btn-secondary" onClick={handleOpenCreate}>Criar Unidade</button>
                </div>
            ) : (
                <div className="units-grid">
                    {units.map((unit) => (
                        <div key={unit.id} className={`unit-card ${expandedUnit === unit.id ? 'unit-card--expanded' : ''}`}>
                            <div className="unit-card-top">
                                <div className="unit-card-icon">🏢</div>
                                <div className="unit-card-info">
                                    <div className="unit-card-title-row">
                                        <h3 className="unit-card-name">{unit.name}</h3>
                                        <span className={`match-badge ${unit.cnpjs?.length > 0 && unit.services?.length > 0 ? 'match-badge--active' : 'match-badge--missing'}`}
                                            title={unit.cnpjs?.length > 0 && unit.services?.length > 0 ? 'Pronta para identificação via IA' : 'Faltam dados para identificação automática'}>
                                            {unit.cnpjs?.length > 0 && unit.services?.length > 0 ? 'Auto-match Ativo' : 'Match Incompleto'}
                                        </span>
                                    </div>
                                    <span className="unit-card-company">{unit.company?.name}</span>
                                </div>
                            </div>

                            <div className="unit-card-fields">
                                <div className="unit-field-row">
                                    <span className="unit-field-key">CNPJ(s) da Unidade</span>
                                    <div className="multi-cnpj-tags" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                                        {unit.cnpjs?.length > 0 ? (
                                            unit.cnpjs.map((c, i) => <span key={i} className="cnpj-tag">{c}</span>)
                                        ) : (
                                            <span className="unit-no-data">Nenhum CNPJ específico</span>
                                        )}
                                    </div>
                                </div>
                                <div className="unit-field-row">
                                    <span className="unit-field-key">Endereço</span>
                                    <span className="unit-field-val">{unit.address || <em className="unit-no-data">Não informado</em>}</span>
                                </div>
                                <div className="unit-field-row">
                                    <span className="unit-field-key">Serviços</span>
                                    <div className={`services-badge ${unit.services?.length === 0 ? 'services-badge--empty' : ''}`}>
                                        {unit.services?.length || 0} serviço(s)
                                    </div>
                                </div>
                            </div>

                            <div className="unit-card-actions">
                                <button className="btn-outline-sm" onClick={() => handleOpenEdit(unit)}>Editar</button>
                                <button
                                    className="btn-outline-sm"
                                    onClick={() => setExpandedUnit(expandedUnit === unit.id ? null : unit.id)}
                                >
                                    {expandedUnit === unit.id ? 'Fechar Serviços' : 'Ver Serviços'}
                                </button>
                                <button
                                    className="btn-danger-sm"
                                    onClick={() => setConfirmDelete({ show: true, unitId: unit.id, unitName: unit.name })}
                                >
                                    Excluir
                                </button>
                            </div>

                            {expandedUnit === unit.id && (
                                <div className="unit-card-services">
                                    <ServicesPanel unit={unit} onUpdate={loadUnits} addToast={addToast} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Criação / Edição */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-box modal-box--wide">
                        <div className="modal-header">
                            <h3 className="modal-title">{editingUnit ? 'Editar Unidade' : 'Nova Unidade'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form className="unit-form" onSubmit={handleSave}>
                            <div className="unit-form-grid">
                                <div className="field field--full">
                                    <label className="field-label">Nome da Unidade <span className="field-required">*</span></label>
                                    <input
                                        className="field-input"
                                        placeholder="Ex: Filial São Paulo, Nome do PDV..."
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="field field--full">
                                    <label className="field-label">CNPJs Associados (exclusivos desta unidade)</label>
                                    <MultiCnpjInput
                                        cnpjs={form.cnpjs}
                                        onChange={(val) => setForm({ ...form, cnpjs: val })}
                                    />
                                    <span className="field-hint">Adicione os CNPJs que aparecem nas faturas desta unidade específica.</span>
                                </div>

                                <div className="field field--full">
                                    <label className="field-label">Endereço Completo</label>
                                    <textarea
                                        className="field-textarea"
                                        rows="2"
                                        placeholder="Rua, Número, Bairro, Cidade..."
                                        value={form.address}
                                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                                    />
                                </div>

                                {!editingUnit && (
                                    <>
                                        <div className="field">
                                            <label className="field-label">CNPJ da Empresa (Matriz) <span className="field-required">*</span></label>
                                            <IMaskInput
                                                mask="00.000.000/0000-00"
                                                className="field-input"
                                                placeholder="00.000.000/0000-00"
                                                value={form.companyCnpj}
                                                onAccept={(val) => setForm({ ...form, companyCnpj: val })}
                                                required
                                            />
                                        </div>
                                        <div className="field">
                                            <label className="field-label">Nome da Empresa (Matriz)</label>
                                            <input
                                                className="field-input"
                                                placeholder="Razão Social"
                                                value={form.companyName}
                                                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="unit-form-info">
                                <div className="info-box info-box--tip">
                                    <span className="info-icon">💡</span>
                                    <span>Após cadastrar a unidade, você poderá adicionar os <strong>contratos e serviços</strong> dela clicando em "Ver Serviços" no card.</span>
                                </div>
                            </div>

                            <div className="unit-form-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingUnit ? 'Salvar Alterações' : 'Criar Unidade'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirmação de Exclusão */}
            <ConfirmModal
                show={confirmDelete.show}
                title="Excluir Unidade?"
                message={`Deseja realmente excluir a unidade "${confirmDelete.unitName}"? Isso desvinculará faturas e excluirá todos os serviços cadastrados para ela.`}
                onConfirm={handleConfirmDelete}
                onCancel={() => setConfirmDelete({ show: false, unitId: null, unitName: '' })}
            />
        </div>
    );
}
