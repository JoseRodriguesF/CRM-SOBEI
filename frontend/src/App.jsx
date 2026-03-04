import React, { useState } from 'react';

// Pages
import { Dashboard } from './pages/Dashboard';
import { UnitsPage } from './pages/UnitsPage';
import { InvoicesPage } from './pages/InvoicesPage';

// Components
import { ToastContainer, useToasts } from './components/Toast';

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const { toasts, addToast, removeToast } = useToasts();

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <Dashboard addToast={addToast} />;
      case 'units': return <UnitsPage addToast={addToast} />;
      case 'invoices': return <InvoicesPage addToast={addToast} />;
      default: return <Dashboard addToast={addToast} />;
    }
  };

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
                className={`top-nav-item ${currentPage === 'home' ? 'top-nav-item--active' : ''}`}
                onClick={() => setCurrentPage('home')}
              >
                Dashboard
              </button>
              <button
                className={`top-nav-item ${currentPage === 'invoices' ? 'top-nav-item--active' : ''}`}
                onClick={() => setCurrentPage('invoices')}
              >
                Faturas
              </button>
              <button
                className={`top-nav-item ${currentPage === 'units' ? 'top-nav-item--active' : ''}`}
                onClick={() => setCurrentPage('units')}
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
            {currentPage === 'home' ? 'Visão Geral' : currentPage === 'units' ? 'Gestão de Unidades' : 'Central de Faturas'}
          </h1>
          <p className="app-subtitle">
            {currentPage === 'home'
              ? 'Acompanhe os principais indicadores de gasto e vencimentos de toda a sua rede.'
              : currentPage === 'units'
                ? 'Cadastre e gerencie suas unidades, filiais e os serviços/contratos vinculados a cada uma.'
                : 'Gerencie todas as faturas digitais, realize uploads com extração automática via IA e envie relatórios.'}
          </p>
        </div>

        {/* Conteúdo da Página */}
        {renderPage()}
      </main>

      {/* Notificações Toasts */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
