import re
import unicodedata
from typing import Optional

UNSPLASH = "https://images.unsplash.com/"
PARAMS = "?auto=format&fit=crop&w=600&q=80"

# Image générique utilisée si aucun produit ne correspond
DEFAULT_IMAGE = "photo-1546549032-9571cd6b27df"
WATER_IMAGE_ID = "photo-1602143407151-7111542de6e8"
PREVIOUS_WATER_IMAGE_ID = "photo-1564419320461-6870880221ad"


def img(photo_id: str) -> str:
    return f"{UNSPLASH}{photo_id}{PARAMS}"


def normalize_product_name(value: str) -> str:
    """Normalise le nom du produit."""
    value = (value or "").lower().strip()

    value = "".join(
        c for c in unicodedata.normalize("NFD", value)
        if unicodedata.category(c) != "Mn"
    )

    value = re.sub(r"[^a-z0-9]+", " ", value)

    return re.sub(r"\s+", " ", value).strip()


# Les règles spécifiques doivent être placées avant les générales.
RULES = [

    # BOISSONS
    (("coca cola", "coca", "soda", "pepsi", "cola"),
     "photo-1554866585-cd94860890b7"),

    (("fanta",), "photo-1624517452488-04869289c4ca"),

    (("sprite",), "photo-1625772299848-391b6a87d7b3"),

    (("eau minerale", "eau gazeuse", "eau plate", "eau"),
     WATER_IMAGE_ID),

    (("jus orange", "orange presse", "jus"),
     "photo-1600271886742-f049cd451bba"),

    (("citronnade", "limonade", "lemonade"),
     "photo-1513558161293-cdaf765edfd7"),

    (("smoothie",), "photo-1505252585461-04db1eb84625"),

    (("milkshake",), "photo-1572490122747-3968b75cc699"),

    (("cafe", "espresso", "cappuccino", "latte"),
     "photo-1509042239860-f550ce710b93"),

    (("the vert", "the noir", "the glace", "the"),
     "photo-1544787219-7f47ccb76574"),

    # PIZZAS
    (("pizza margherita", "margherita"),
     "photo-1579751626657-72bc17010498"),

    (("pizza", "calzone"),
     "photo-1513104890138-7c749659a591"),

    # BURGERS
    (("cheeseburger", "hamburger", "burger"),
     "photo-1568901346375-23c9450c58cd"),

    # TACOS
    (("tacos",), "photo-1551504734-5ee1c4a1479b"),

    # SANDWICHS
    (("sandwich", "panini", "chapati", "makloub",
      "libanais", "kebab", "wrap", "baguette farcie"),
     "photo-1528735602780-2552fd46c7af"),

    (("hot dog",), "photo-1612392062798-2dbaa3c7f3f5"),

    # ACCOMPAGNEMENTS
    (("frites", "frite", "potatoes"),
     "photo-1573080496219-bb080dd4f877"),

    (("nuggets",), "photo-1562967914-608f82629710"),

    (("ailes poulet", "wings"),
     "photo-1527477396000-e27163b481c2"),

    # CREPES ET DESSERTS
    (("crepe", "crepes", "crepe sucree", "crepe nutella"),
     "photo-1519676867240-f03562e64548"),

    (("gaufre", "gaufres", "waffle"),
     "photo-1562376552-0d160a2f238d"),

    (("pancake", "pancakes"),
     "photo-1528207776546-365bb710ee93"),

    (("glace", "glaces", "ice cream", "sorbet"),
     "photo-1563805042-7684c019e1cb"),

    (("fondant chocolat", "brownie", "gateau chocolat"),
     "photo-1606313564200-e75d5e30476c"),

    (("cheesecake",), "photo-1533134242443-d4fd215305ad"),

    (("tiramisu",), "photo-1571877227200-a0d98ea607e9"),

    (("donut", "donuts", "beignet"),
     "photo-1551024506-0bccd828d307"),

    (("baklawa", "baklava", "makroud", "makroudh"),
     "photo-1576618148400-f54bed99fcfd"),

    (("croissant",), "photo-1555507036-ab1f4038808a"),

    (("mille feuille", "eclair", "eclairs", "patisserie"),
     "photo-1578985545062-69928b1d9587"),

    # PLATS TUNISIENS
    (("couscous",), "photo-1574484284002-952d92456975"),

    (("ojja", "chakchouka", "shakshuka", "oeufs tomate"),
     "photo-1525351484163-7529414344d8"),

    (("brik", "brick"), "photo-1601050690597-df0568f70950"),

    (("soupe", "chorba", "lablebi", "lablabi"),
     "photo-1547592180-85f173990554"),

    (("salade",), "photo-1512621776951-a57141f2eefd"),

    # PATES
    (("lasagne", "lasagna"),
     "photo-1574894709920-11b28e7367e3"),

    (("spaghetti", "tagliatelle", "penne",
      "macaroni", "pates", "pasta"),
     "photo-1473093295043-cdd812d0e601"),

    (("paella",), "photo-1534080564583-6be75777b70a"),

    (("riz",), "photo-1512058564366-18510be2db19"),

    # VIANDES
    (("cordon bleu",), "photo-1532550907401-a500c9a57435"),

    (("poulet", "escalope"),
     "photo-1532550907401-a500c9a57435"),

    (("steak", "viande", "boeuf", "entrecote",
      "cotelette", "agneau", "merguez"),
     "photo-1544025162-d76694265947"),

    # POISSONS
    (("crevette", "crevettes", "fruit de mer",
      "fruits de mer", "calamar", "poulpe"),
     "photo-1565680018434-b513d5e5fd47"),

    (("saumon",), "photo-1467003909585-2f8a72700288"),

    (("daurade", "poisson", "filet poisson"),
     "photo-1519708227418-c8fd9a32b7a2"),

    # BOULANGERIE
    (("baguette", "pain", "bagel"),
     "photo-1509440159596-0249088772ff"),
]


# Compilation des règles
COMPILED_RULES = []

for keywords, photo_id in RULES:
    for keyword in keywords:
        normalized = normalize_product_name(keyword)

        pattern = re.compile(
            rf"\b{re.escape(normalized)}\b"
        )

        COMPILED_RULES.append((pattern, img(photo_id)))


def get_product_image(product_name: str) -> Optional[str]:
    """Retourne une image adaptée au nom du produit."""

    name = normalize_product_name(product_name)

    if not name:
        return None

    for pattern, url in COMPILED_RULES:
        if pattern.search(name):
            return url

    return None


def with_images(products: list) -> list:
    """
    Photo du commerçant prioritaire.
    Sinon, photo Unsplash correspondante.
    Sinon, photo générique.
    """

    for product in products:
        name = normalize_product_name(product.get("product_name", ""))

        # Une vraie photo ajoutée par le commerçant
        if product.get("image_url"):
            if PREVIOUS_WATER_IMAGE_ID in product["image_url"] and "eau" in name.split():
                product["image_url"] = img(WATER_IMAGE_ID)
                product["stock_image"] = True
                continue
            product["stock_image"] = False
            continue

        # Recherche d'une photo selon le nom
        url = get_product_image(product.get("product_name", ""))

        if url:
            product["image_url"] = url
        else:
            product["image_url"] = img(DEFAULT_IMAGE)

        product["stock_image"] = True

    return products