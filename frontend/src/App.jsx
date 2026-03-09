import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// Pages
import { Dashboard } from './pages/Dashboard';
import { UnitsPage } from './pages/UnitsPage';
import { InvoicesPage } from './pages/InvoicesPage';

// Components
import { ToastContainer, useToasts } from './components/Toast';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, addToast, removeToast } = useToasts();

  const currentPath = location.pathname;

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <div className="top-bar-shell">
        <header className="top-bar">
          <div className="top-bar-left">
            <div className="top-bar-title-group">
              <span className="top-bar-title">CRM SOBEI</span>
              <span className="top-bar-subtitle">Sistema de Gestão de Faturas</span>
            </div>
          </div>

          <div className="top-bar-right">
            <nav className="top-nav">
              <button
                className={`top-nav-item ${currentPath === '/' ? 'top-nav-item--active' : ''}`}
                onClick={() => navigate('/')}
              >
                Dashboard
              </button>
              <button
                className={`top-nav-item ${currentPath === '/invoices' ? 'top-nav-item--active' : ''}`}
                onClick={() => navigate('/invoices')}
              >
                Faturas
              </button>
              <button
                className={`top-nav-item ${currentPath === '/units' ? 'top-nav-item--active' : ''}`}
                onClick={() => navigate('/units')}
              >
                Unidades
              </button>
            </nav>
          </div>
        </header>
      </div>

      <main className="app-container">
        {/* Header Dinâmico */}
        <div className="app-header">
          <h1 className="app-title">
            {currentPath === '/' ? 'Visão Geral' : currentPath === '/units' ? 'Gestão de Unidades' : 'Central de Faturas'}
          </h1>
          <p className="app-subtitle">
            {currentPath === '/'
              ? 'Acompanhe os principais indicadores de gasto e vencimentos de toda a sua rede.'
              : currentPath === '/units'
                ? 'Cadastre e gerencie suas unidades, filiais e os serviços/contratos vinculados a cada uma.'
                : 'Gerencie todas as faturas digitais, realize uploads com extração automática via IA e envie relatórios.'}
          </p>
        </div>

        {/* Conteúdo da Página */}
        <Routes>
          <Route path="/" element={<Dashboard addToast={addToast} />} />
          <Route path="/invoices" element={<InvoicesPage addToast={addToast} />} />
          <Route path="/units" element={<UnitsPage addToast={addToast} />} />
          <Route path="*" element={<Dashboard addToast={addToast} />} />
        </Routes>
      </main>

      {/* Notificações Toasts */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
