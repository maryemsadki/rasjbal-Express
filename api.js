export const API_BASE = "http://127.0.0.1:8000";
const API = API_BASE;
export const TOKEN_KEY = "rje_token";

function failure(res, data, token) {
  if (res.status === 401 && token) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("rje-logout"));
  }
  let msg = "Une erreur est survenue.";
  if (typeof data?.detail === "string") msg = data.detail;
  else if (Array.isArray(data?.detail)) msg = "Veuillez vérifier les champs du formulaire.";
  return new Error(msg);
}

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let res;
  try {
    res = await fetch(API + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error("Impossible de joindre le serveur. Vérifiez votre connexion.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw failure(res, data, token);
  return data;
}

async function upload(path, blob) {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  let res;
  try {
    res = await fetch(API + path, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new Error("Impossible de joindre le serveur. Vérifiez votre connexion.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw failure(res, data, token);
  return data;
}

const send = (method) => (path, body) =>
  request(path, { method, body: body ? JSON.stringify(body) : undefined });
const post = send("POST");
const patch = send("PATCH");
const del = send("DELETE");

export const api = {
  // public
  merchants: (sort = "top") => request(`/merchants?sort=${sort}`),
  merchant: (id) => request(`/merchants/${id}`),
  products: (id) => request(`/merchants/${id}/products`),
  search: (q, o = {}) =>
    request(
      "/search?" +
        new URLSearchParams({
          q,
          ...(o.maxPrice ? { max_price: o.maxPrice } : {}),
          ...(o.openOnly ? { open_only: "true" } : {}),
        }).toString()
    ),
  quote: (p) => request("/delivery/quote?" + new URLSearchParams(p).toString()),
  // authentification
  register: (b) => post("/auth/register", b),
  login: (b) => post("/auth/login", b),
  me: () => request("/auth/me"),
  // client
  createOrder: (b) => post("/orders", b),
  myOrders: () => request("/orders/mine"),
  cancelOrder: (id) => post(`/orders/${id}/cancel`),
  reviewOrder: (id, body) => post(`/orders/${id}/review`, body),
  createDelivery: (b) => post("/deliveries", b),
  myDeliveries: () => request("/deliveries/mine"),
  favorites: () => request("/favorites"),
  favoriteAdd: (id) => post(`/favorites/${id}`),
  favoriteRemove: (id) => del(`/favorites/${id}`),
  promoCheck: (p) => request("/promo/check?" + new URLSearchParams(p).toString()),
  // commerçant
  shopGet: () => request("/merchant/shop"),
  shopUpdate: (b) => patch("/merchant/shop", b),
  mOrders: () => request("/merchant/orders"),
  mOrderStatus: (id, status) => patch(`/merchant/orders/${id}/status`, { status }),
  mMenu: () => request("/merchant/menu"),
  mProducts: () => request("/merchant/products"),
  mProductAdd: (b) => post("/merchant/products", b),
  mProductUpdate: (id, b) => patch(`/merchant/products/${id}`, b),
  mProductDelete: (id) => del(`/merchant/products/${id}`),
  mCategoryRename: (b) => patch("/merchant/categories", b),
  mImport: (b) => post("/merchant/products/import", b),
  mPhoto: (id, blob) => upload(`/merchant/products/${id}/image`, blob),
  mPhotoRemove: (id) => del(`/merchant/products/${id}/image`),
  // livreur
  dAvailable: () => request("/driver/deliveries/available"),
  dMine: () => request("/driver/deliveries/mine"),
  dAccept: (id) => post(`/driver/deliveries/${id}/accept`),
  dPickup: (id) => post(`/driver/deliveries/${id}/pickup`),
  dDeliver: (id) => post(`/driver/deliveries/${id}/deliver`),
  // admin
  aStats: () => request("/admin/stats"),
  aOrders: () => request("/admin/orders"),
  aOrderStatus: (id, status) => patch(`/admin/orders/${id}/status`, { status }),
  aDeliveries: () => request("/admin/deliveries"),
  aDeliveryAssign: (id, driver_id) => post(`/admin/deliveries/${id}/assign`, { driver_id }),
  aDeliveryStatus: (id, status) => patch(`/admin/deliveries/${id}/status`, { status }),
  aMerchants: () => request("/admin/merchants"),
  aMerchantAdd: (b) => post("/admin/merchants", b),
  aMerchantUpdate: (id, b) => patch(`/admin/merchants/${id}`, b),
  aMerchantLocation: (id, b) => patch(`/admin/merchants/${id}/location`, b),
  aMenu: (id) => request(`/admin/merchants/${id}/products`),
  aProducts: () => request("/admin/products"),
  aProductAdd: (mid, b) => post(`/admin/merchants/${mid}/products`, b),
  aProductUpdate: (mid, pid, b) => patch(`/admin/merchants/${mid}/products/${pid}`, b),
  aProductDelete: (mid, pid) => del(`/admin/merchants/${mid}/products/${pid}`),
  aImport: (id, b) => post(`/admin/merchants/${id}/products/import`, b),
  aImportPreview: (id, b) => post(`/admin/merchants/${id}/products/import/preview`, b),
  aCategories: () => request("/admin/categories"),
  aCategoryRename: (mid, b) => patch(`/admin/merchants/${mid}/categories`, b),
  aPhoto: (mid, pid, blob) => upload(`/admin/merchants/${mid}/products/${pid}/image`, blob),
  aPhotoRemove: (mid, pid) => del(`/admin/merchants/${mid}/products/${pid}/image`),
  aUsers: () => request("/admin/users"),
  aCustomers: () => request("/admin/customers"),
  aUserAdd: (b) => post("/admin/users", b),
  aUserUpdate: (id, b) => patch(`/admin/users/${id}`, b),
  aPromos: () => request("/admin/promos"),
  aPromoAdd: (b) => post("/admin/promos", b),
  aPromoUpdate: (id, b) => patch(`/admin/promos/${id}`, b),
};