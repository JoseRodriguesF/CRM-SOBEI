import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { CustomSelect } from '../components/CustomSelect';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { IMaskInput } from 'react-imask';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
    'PAGA': '#22c55e',
    'EM ABERTO': '#facc15',
    'ATRASADA': '#f97373',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Dashboard({ addToast }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [units, setUnits] = useState([]);
    const [filters, setFilters] = useState({ month: '', unitId: '' });

    const loadUnits = useCallback(async () => {
        try {
            const allUnits = await api.units.list();
            setUnits(allUnits);
        } catch (err) {
            console.error('[Dashboard] loadUnits:', err);
        }
    }, []);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const stats = await api.invoices.dashboard(filters);
            setData(stats);
        } catch {
            addToast('Erro ao carregar dashboard', 'error');
        } finally {
            setLoading(false);
        }
    }, [filters, addToast]);

    useEffect(() => { loadUnits(); }, [loadUnits]);
    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    if (loading && !data) return <div className="dashboard-loading">Carregando indicadores...</div>;

    return (
        <div className="dashboard-layout">
            <div className="dashboard-controls card card--compact">
                <div className="filters-grid filters-grid--compact">
                    <div className="field">
                        <label className="field-label">Filtro por Mês</label>
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
                        <label className="field-label">Filtro por Unidade</label>
                        <CustomSelect
                            options={[{ label: 'Todas Unidades', value: '' }, ...units.map(u => ({ label: u.name, value: u.id }))]}
                            value={filters.unitId}
                            onChange={(val) => setFilters(f => ({ ...f, unitId: val }))}
                        />
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* ... existing cards ... */}
                <div className="card dashboard-card dashboard-card--highlight">
                    <div className="card-header">
                        <h3 className="card-title">Resumo Financeiro</h3>
                    </div>
                    <div className="card-body card-splits">
                        <div className="card-split">
                            <span className="summary-label">Total em Aberto</span>
                            <div className="highlight-value">
                                <span className="currency">R$</span>
                                {(data?.totalOpenAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="card-split">
                            <span className="summary-label">Sendo Atrasadas (Vencidas)</span>
                            <div className="highlight-value highlight-value--danger">
                                <span className="currency">R$</span>
                                {(data?.totalDelayedAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Distribuição de Status</h3>
                    </div>
                    <div className="card-body" style={{ height: '240px' }}>
                        {data?.byStatus?.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.byStatus.map(s => ({ name: s.status, value: s._count._all }))}
                                        cx="50%" cy="50%"
                                        innerRadius={60} outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.byStatus.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                        itemStyle={{ color: '#e2e8f0' }}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="table-empty">Sem dados para o gráfico</div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Datas de Vencimento</h3>
                    </div>
                    <div className="card-body">
                        <div className="due-list">
                            <span className="due-list-title">Frequência por Dia do Mês</span>
                            {data?.dueDays.map(d => (
                                <div key={d.day} className="due-item">
                                    <span className="due-day">Dia {String(d.day).padStart(2, '0')}</span>
                                    <span className="due-sep">•</span>
                                    <span className="due-count">{d.count} faturas</span>
                                </div>
                            ))}
                            {(!data?.dueDays || data.dueDays.length === 0) && (
                                <p className="empty-msg">Sem datas previstas.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ─── Análise Inteligente do Período ──────────────────────────────── */}
                <div className="analysis-section">
                    <h2 className="app-title" style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Análise Inteligente do Período</h2>
                    <div className="analysis-grid">
                        
                        {/* 1. Contratos sem Faturas */}
                        <div className="card analysis-card">
                            <div className="card-header">
                                <h3 className="card-title">Contratos Pendentes de Fatura</h3>
                            </div>
                            <div className="card-body">
                                <div className="analysis-list">
                                    {data?.analysis?.missingServices.map(s => (
                                        <div key={s.id} className="analysis-item analysis-item--warning">
                                            <span className="analysis-tag">Contrato Ativo</span>
                                            <span className="analysis-title">{s.name} ({s.contract})</span>
                                            <span className="analysis-desc">Unidade: {s.unitName}</span>
                                        </div>
                                    ))}
                                    {(!data?.analysis?.missingServices || data.analysis.missingServices.length === 0) && (
                                        <p className="analysis-empty">Todos os contratos possuem faturas para este mês.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Divergências de CNPJ */}
                        <div className="card analysis-card">
                            <div className="card-header">
                                <h3 className="card-title">Divergências de CNPJ</h3>
                            </div>
                            <div className="card-body">
                                <div className="analysis-list">
                                    {data?.analysis?.mismatchedCnpjs.map(c => (
                                        <div key={c.id} className="analysis-item analysis-item--critical">
                                            <span className="analysis-tag">CNPJ Incorreto</span>
                                            <span className="analysis-title">Fatura: {c.cnpj}</span>
                                            <span className="analysis-desc">Unidade {c.unitName} espera: {c.expected}</span>
                                        </div>
                                    ))}
                                    {(!data?.analysis?.mismatchedCnpjs || data.analysis.mismatchedCnpjs.length === 0) && (
                                        <p className="analysis-empty">Nenhuma divergência de CNPJ detectada.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 3. Serviços não registrados */}
                        <div className="card analysis-card">
                            <div className="card-header">
                                <h3 className="card-title">Serviços não Catalogados</h3>
                            </div>
                            <div className="card-body">
                                <div className="analysis-list">
                                    {data?.analysis?.unregisteredServices.map(s => (
                                        <div key={s.id} className="analysis-item analysis-item--warning">
                                            <span className="analysis-tag">Serviço Desconhecido</span>
                                            <span className="analysis-title">{s.name}</span>
                                            <span className="analysis-desc">Detectado em fatura da unidade {s.unitName}</span>
                                        </div>
                                    ))}
                                    {(!data?.analysis?.unregisteredServices || data.analysis.unregisteredServices.length === 0) && (
                                        <p className="analysis-empty">Todas as faturas correspondem a serviços registrados.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 4. Soluciona TI (Locação de Hardware) */}
                        <div className="card analysis-card">
                            <div className="card-header">
                                <h3 className="card-title">Locação de Hardware (Soluciona TI)</h3>
                            </div>
                            <div className="card-body">
                                <div className="analysis-list">
                                    {data?.analysis?.solucionaInvoices.map(s => (
                                        <div key={s.id} className="analysis-item">
                                            <span className="analysis-tag" style={{ color: 'var(--info)' }}>Dispositivos Alugados</span>
                                            <span className="analysis-title">{s.unitName}</span>
                                            <span className="analysis-desc" style={{ fontSize: '0.7rem' }}>
                                                {s.serviceName} • <strong>R$ {s.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                            </span>
                                        </div>
                                    ))}
                                    {(!data?.analysis?.solucionaInvoices || data.analysis.solucionaInvoices.length === 0) && (
                                        <p className="analysis-empty">Nenhuma fatura com Soluciona TI detectada.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
