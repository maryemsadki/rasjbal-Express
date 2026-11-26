import { createContext, useContext, useEffect, useState } from "react";
import { api, TOKEN_KEY } from "./api";

const AuthContext = createContext(null);

export const ROLE_HOME = {
  Admin: "/admin",
  Merchant: "/merchant-space",
  Driver: "/driver",
  Customer: "/",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setReady(true);
      return;
    }
    api.me().then(setUser).catch(() => {}).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("rje-logout", onLogout);
    return () => window.removeEventListener("rje-logout", onLogout);
  }, []);

  const start = (res) => {
    localStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
    return res.user;
  };

  const login = async (phone, password) => start(await api.login({ phone, password }));
  const register = async (body) => start(await api.register(body));
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);