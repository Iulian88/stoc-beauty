import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: 'var(--text)' }}>
            A apărut o eroare
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20, wordBreak: 'break-word' }}>
            {this.state.error?.message || 'Eroare necunoscută'}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Încearcă din nou
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
