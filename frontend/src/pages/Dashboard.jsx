import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { CustomSelect } from '../components/CustomSelect';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { IMaskInput } from 'react-imask';

export function Dashboard({ addToast }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [units, setUnits] = useState([]);
    const [filters, setFilters] = useState({ month: '', unitId: '' });

    useEffect(() => {
        loadUnits();
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [filters]);

    const loadUnits = async () => {
        try {
            const allUnits = await api.units.list();
            setUnits(allUnits);
        } catch (err) {
            console.error(err);
        }
    };

    const loadDashboard = async () => {
        setLoading(true);
        try {
            const stats = await api.invoices.dashboard(filters);
            setData(stats);
        } catch (err) {
            addToast('Erro ao carregar dashboard', 'error');
        } finally {
            setLoading(false);
        }
    };

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
                            onAccept={(val) => setFilters({ ...filters, month: val })}
                        />
                    </div>
                    <div className="field">
                        <label className="field-label">Filtro por Unidade</label>
                        <CustomSelect
                            options={[{ label: 'Todas Unidades', value: '' }, ...units.map(u => ({ label: u.name, value: u.id }))]}
                            value={filters.unitId}
                            onChange={(val) => setFilters({ ...filters, unitId: val })}
                        />
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
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
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.byStatus.map((entry, index) => {
                                            const colors = { 'PAGA': '#22c55e', 'EM ABERTO': '#facc15', 'ATRASADA': '#f97373' };
                                            return <Cell key={`cell-${index}`} fill={colors[entry.status] || '#94a3b8'} />;
                                        })}
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
                            {(!data?.dueDays || data.dueDays.length === 0) && <p className="empty-msg">Sem datas previstas.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
