import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { UnitsPage } from './pages/UnitsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ToastContainer } from './components/Toast';
import { useToasts } from './hooks/useToasts';

const ROUTES = [
  {
    path: '/',
    element: Dashboard,
    label: 'Dashboard',
    title: 'Visão Geral',
    subtitle: 'Acompanhe os principais indicadores de gasto e vencimentos de toda a sua rede.',
  },
  {
    path: '/invoices',
    element: InvoicesPage,
    label: 'Faturas',
    title: 'Central de Faturas',
    subtitle: 'Gerencie todas as faturas digitais, realize uploads com extração automática via IA e envie relatórios.',
  },
  {
    path: '/units',
    element: UnitsPage,
    label: 'Unidades',
    title: 'Gestão de Unidades',
    subtitle: 'Cadastre e gerencie suas unidades, filiais e os serviços/contratos vinculados a cada uma.',
  },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, addToast, removeToast } = useToasts();

  const currentRoute = ROUTES.find(r => r.path === location.pathname) ?? ROUTES[0];

  return (
    <div className="app-shell">
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
              {ROUTES.map(route => (
                <button
                  key={route.path}
                  className={`top-nav-item ${location.pathname === route.path ? 'top-nav-item--active' : ''}`}
                  onClick={() => navigate(route.path)}
                >
                  {route.label}
                </button>
              ))}
            </nav>
          </div>
        </header>
      </div>

      <main className="app-container">
        <div className="app-header">
          <h1 className="app-title">{currentRoute.title}</h1>
          <p className="app-subtitle">{currentRoute.subtitle}</p>
        </div>

        <Routes>
          {ROUTES.map((route) => {
            const Component = route.element;
            return <Route key={route.path} path={route.path} element={<Component addToast={addToast} />} />;
          })}
          <Route path="*" element={<Dashboard addToast={addToast} />} />
        </Routes>
      </main>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
