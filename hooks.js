import { useCallback, useEffect, useState } from "react";

export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fn()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load };
}

// Comme useFetch, avec actualisation automatique silencieuse
export function usePolling(fn, ms = 10000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback((silent) => {
    if (!silent) setLoading(true);
    return fn()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), ms);
    return () => clearInterval(t);
  }, [load, ms]);

  return { data, error, loading, reload: () => load(false), refresh: () => load(true) };
}