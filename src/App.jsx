import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Transactions from './pages/Transactions';
import Stock from './pages/Stock';
import ZReports from './pages/ZReports';
import { StockProvider } from './context/StockContext';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'upload', label: 'Adaugă', icon: '📸' },
  { id: 'stock', label: 'Stoc', icon: '📦' },
  { id: 'transactions', label: 'Istoric', icon: '📋' },
  { id: 'zreports', label: 'Z-uri', icon: '🧾' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <StockProvider>
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">✦</span>
            <span className="logo-text">StocBeauty</span>
          </div>
          <span className="header-sub">Gestiune stoc</span>
        </div>
      </header>

      <main className="app-main">
        <ErrorBoundary>
          {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
          {page === 'upload' && <Upload onNavigate={setPage} />}
          {page === 'stock' && <Stock />}
          {page === 'transactions' && <Transactions />}
          {page === 'zreports' && <ZReports />}
        </ErrorBoundary>
      </main>

      <nav className="bottom-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
    </StockProvider>
  );
}
