export function Loading() {
  return (
    <div className="stack">
      {[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="state error-box">
      <div className="state-icon">⚠️</div>
      <p>{message}</p>
      {onRetry && <button className="btn btn-primary" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function Empty({ icon = "🗂️", title, text, children }) {
  return (
    <div className="state">
      <div className="state-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}