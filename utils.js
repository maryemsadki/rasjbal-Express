import { API_BASE } from "./api";

// Les photos envoyées sont servies par le backend ; les liens https restent tels quels
export const imgSrc = (u) => (!u ? null : u.startsWith("/uploads/") ? API_BASE + u : u);

// Les prix tunisiens s'écrivent avec 3 décimales (ex : 14,000 DT)
export const fmt = (n) => `${Number(n || 0).toFixed(3).replace(".", ",")} DT`;

export const fmtDate = (d) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export const fmtKm = (km) => `${String(km).replace(".", ",")} km`;

const norm = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Icônes des commerces (par catégorie)
const ICONS = [
  ["pharm", "💊"], ["pizz", "🍕"], ["fast", "🍔"], ["snack", "🥪"], ["poisson", "🐟"],
  ["epic", "🛒"], ["super", "🛒"], ["pizza", "🍕"], ["burger", "🍔"], ["sandwich", "🥪"],
  ["tacos", "🌮"], ["mexic", "🌮"], ["sushi", "🍣"], ["asia", "🥢"], ["past", "🍝"],
  ["ital", "🍝"], ["poulet", "🍗"], ["chicken", "🍗"], ["grill", "🍖"], ["salad", "🥗"],
  ["glace", "🍦"], ["ice cream", "🍦"], ["crepe", "🥞"], ["pancake", "🥞"], ["cafe", "☕"],
  ["coffee", "☕"], ["boulang", "🥖"], ["bakery", "🥖"], ["sweet", "🍰"], ["dessert", "🍰"],
  ["jus", "🧃"], ["tunis", "🍲"], ["tradition", "🍲"], ["oriental", "🍲"], ["pat", "🥐"],
  ["rest", "🍽️"],
];

export function categoryIcon(category = "") {
  const c = norm(category);
  const hit = ICONS.find(([k]) => c.includes(k));
  return hit ? hit[1] : "🏪";
}

// Icônes des plats (par nom et catégorie) : la première règle qui correspond gagne
const DISH_ICONS = [
  [["pizza", "calzone"], "🍕"],
  [["burger"], "🍔"],
  [["tacos"], "🌮"],
  [["baguette", "cornet", "sandwich", "kebab", "makloub", "wrap", "panini"], "🥪"],
  [["crepe", "pancake"], "🥞"],
  [["gaufre"], "🧇"],
  [["salade"], "🥗"],
  [["pates", "pate", "spaghetti", "lasagne", "ravioli"], "🍝"],
  [["riz", "paella"], "🍚"],
  [["brik"], "🥟"],
  [["soupe", "chorba", "lablabi"], "🍲"],
  [["ojja", "omelette", "dejeuner"], "🍳"],
  [["crevette", "symphonie", "mer"], "🍤"],
  [["poisson", "daurade", "loup", "saumon"], "🐟"],
  [["frites"], "🍟"],
  [["poulet", "chicken", "cordon", "chich", "taouk"], "🍗"],
  [["viande", "boeuf", "kefta", "agneau", "steak", "grillade"], "🥩"],
  [["milkshake", "frappuccino", "frappes"], "🥤"],
  [["smoothie", "mojito", "jus", "citronnade"], "🧃"],
  [["cafe", "cafes", "cappuccino", "latte", "capucin", "express", "americain", "turc"], "☕"],
  [["the", "infusion"], "🍵"],
  [["chocolat"], "🍫"],
  [["glace"], "🍦"],
  [["cheesecake", "gateau", "dessert"], "🍰"],
  [["soda", "sodas", "schweppes", "shark", "eau"], "🥤"],
  [["viennoiserie", "croissant"], "🥐"],
  [["fromage", "cheese"], "🧀"],
];

export function dishEmoji(name = "", category = "") {
  const tokens = norm(`${name} ${category}`).split(" ").filter(Boolean);
  const hit = DISH_ICONS.find(([keys]) =>
    tokens.some((t) => keys.some((k) => t === k || (k.length > 4 && t.startsWith(k))))
  );
  return hit ? hit[1] : "🍽️";
}

export const STATUS_STEPS = [
  { key: "Pending", label: "Commande envoyée" },
  { key: "Confirmed", label: "Commande confirmée" },
  { key: "Preparing", label: "En préparation" },
  { key: "Ready", label: "Commande prête" },
  { key: "Delivering", label: "En livraison" },
  { key: "Delivered", label: "Commande livrée" },
];

export const ORDER_LABELS = {
  Pending: "Nouvelle",
  Confirmed: "Confirmée",
  Preparing: "En préparation",
  Ready: "Prête",
  Delivering: "En livraison",
  Delivered: "Livrée",
  Cancelled: "Annulée",
};

export const DELIVERY_LABELS = {
  Pending: "Recherche d'un livreur",
  Assigned: "Livreur assigné",
  PickedUp: "En cours de livraison",
  Delivered: "Livrée",
  Cancelled: "Annulée",
};

export const ALLERGENS = [
  "Gluten", "Lait / lactose", "Œufs", "Arachides", "Fruits à coque", "Poisson",
  "Fruits de mer", "Soja", "Sésame", "Moutarde", "Céleri",
];

export function normalizePhone(raw) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("216") && d.length === 11) d = d.slice(3);
  return d;
}

export const isValidPhone = (raw) => /^\d{8}$/.test(normalizePhone(raw));

// Regroupe les variantes (Moyenne/Maxi, garnitures) en un seul article
export function groupVariants(items = []) {
  const out = [];
  const index = new Map();
  for (const p of items) {
    if (!p.group_name) {
      out.push(p);
      continue;
    }
    if (!index.has(p.group_name)) {
      const g = { ...p, variants: [p] };
      index.set(p.group_name, g);
      out.push(g);
    } else {
      index.get(p.group_name).variants.push(p);
    }
  }
  out.forEach((g) => g.variants?.sort((a, b) => Number(a.price) - Number(b.price)));
  return out;
}