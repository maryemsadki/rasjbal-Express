import { createContext, useContext, useEffect, useState } from "react";

const AddressContext = createContext(null);
const LIST_KEY = "rje_addresses";
const SEL_KEY = "rje_address_sel";

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function AddressProvider({ children }) {
  const [addresses, setAddresses] = useState(() => read(LIST_KEY, []));
  const [selectedId, setSelectedId] = useState(() => read(SEL_KEY, null));
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(addresses));
      localStorage.setItem(SEL_KEY, JSON.stringify(selectedId));
    } catch { /* stockage indisponible */ }
  }, [addresses, selectedId]);

  const current = addresses.find((a) => a.id === selectedId) || addresses[0] || null;

  const save = (addr) => {
    setAddresses((list) =>
      list.some((a) => a.id === addr.id) ? list.map((a) => (a.id === addr.id ? addr : a)) : [...list, addr]
    );
    setSelectedId(addr.id);
  };
  const remove = (id) => {
    setAddresses((list) => list.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <AddressContext.Provider
      value={{
        addresses, current, save, remove, select: setSelectedId,
        sheetOpen, openSheet: () => setSheetOpen(true), closeSheet: () => setSheetOpen(false),
      }}
    >
      {children}
    </AddressContext.Provider>
  );
}

export const useAddress = () => useContext(AddressContext);