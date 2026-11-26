import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, ROLE_HOME } from "../AuthContext";
import { isValidPhone, normalizePhone } from "../utils";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [form, setForm] = useState({ phone: "", password: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/account" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!isValidPhone(form.phone)) return setError("Le numéro doit contenir 8 chiffres.");
    if (!form.password) return setError("Veuillez saisir votre mot de passe.");
    setBusy(true);
    try {
      const u = await login(normalizePhone(form.phone), form.password);
      navigate(u.role === "Customer" ? from || "/" : ROLE_HOME[u.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="hero auth-hero">
        <p className="hero-brand">🏔️ RasJbal Express</p>
        <h1>Bon retour !</h1>
        <p>Connectez-vous pour commander et suivre vos livraisons.</p>
      </section>

      <form onSubmit={submit} className="stack auth-form">
        <label className="field">Téléphone
          <input value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="Ex : 20 123 456" autoComplete="tel" />
        </label>
        <label className="field">Mot de passe
          <div className="pw">
            <input type={show ? "text" : "password"} value={form.password} onChange={set("password")} autoComplete="current-password" />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)}>{show ? "Masquer" : "Voir"}</button>
          </div>
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
        <p className="center muted">
          Pas encore de compte ? <Link to="/register" state={{ from }} className="link">Créer un compte</Link>
        </p>
      </form>
    </div>
  );
}