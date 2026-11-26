import { Link, Navigate } from "react-router-dom";
import { useAuth, ROLE_HOME } from "../AuthContext";
import { Loading } from "../components/StateViews";

const ROLE_LABEL = { Customer: "Client", Merchant: "Commerçant", Driver: "Livreur", Admin: "Administrateur" };

export default function Account() {
  const { user, ready, logout } = useAuth();
  if (!ready) return <div className="page"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="page">
      <section className="hero">
        <div className="avatar">{user.full_name.charAt(0).toUpperCase()}</div>
        <h1>{user.full_name}</h1>
        <p>{ROLE_LABEL[user.role]} · {user.phone}</p>
      </section>

      <div className="stack" style={{ marginTop: 16 }}>
        {user.role === "Customer" ? (
          <>
            <Link to="/orders" className="card menu-item">📦 Mes commandes</Link>
            <Link to="/delivery" className="card menu-item">🛵 Demander une livraison</Link>
          </>
        ) : (
          <Link to={ROLE_HOME[user.role]} className="card menu-item">📊 Ouvrir mon espace</Link>
        )}
        <button className="btn btn-outline btn-block" onClick={logout}>Se déconnecter</button>
      </div>
    </div>
  );
}