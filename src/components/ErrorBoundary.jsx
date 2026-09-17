import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught an exception:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#fff', background: '#141513', fontFamily: 'sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <h2 style={{ color: '#c9f36a' }}>Console Interface Active</h2>
          {this.state.error && (
            <pre style={{ color: '#ff6b6b', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '10px', maxWidth: '100%', whiteSpace: 'pre-wrap', fontSize: '12px', textAlign: 'left', overflow: 'auto', margin: '16px 0 24px' }}>
              {this.state.error.stack || this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <p style={{ color: '#8c9085', maxWidth: '500px', margin: '0 0 24px' }}>Click below to reload the console cleanly.</p>
          <button onClick={() => window.location.reload()} style={{ background: '#c9f36a', color: '#141513', border: 'none', padding: '12px 24px', borderRadius: '24px', fontWeight: 'bold', cursor: 'pointer' }}>
            Reload Console
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
