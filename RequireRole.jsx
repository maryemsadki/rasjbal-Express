import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { Loading } from "./StateViews";

export default function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <div className="page"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/account" replace />;
  return children;
}