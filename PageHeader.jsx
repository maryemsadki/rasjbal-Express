import { useNavigate } from "react-router-dom";

export default function PageHeader({ title, subtitle }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <button className="back" onClick={() => navigate(-1)} aria-label="Retour">←</button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
    </header>
  );
}