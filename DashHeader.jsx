import { useAuth } from "../AuthContext";

export default function DashHeader({ title, subtitle, children }) {
  const { user, logout } = useAuth();
  return (
    <header className="dash-head">
      <div>
        <h1>{title}</h1>
        <p className="muted small">{subtitle || user?.full_name}</p>
      </div>
      <div className="dash-actions">
        {children}
        <button className="btn btn-outline btn-small" onClick={logout}>Déconnexion</button>
      </div>
    </header>
  );
}