import re
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from database import get_db
from delivery import check_point, quote
from product_images import with_images
from security import require, require_merchant

router = APIRouter()

ALLERGENS = ["Gluten", "Lait / lactose", "Œufs", "Arachides", "Fruits à coque", "Poisson",
             "Fruits de mer", "Soja", "Sésame", "Moutarde", "Céleri"]

# Dossier des photos envoyées (servi par main.py sous /uploads)
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads" / "products"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_PHOTO = 1_500_000  # 1,5 Mo : le navigateur réduit la photo avant l'envoi
PHOTO_RE = re.compile(r"^/uploads/products/[0-9a-f]{32}\.jpg$")


# ---------- Utilitaires ----------
def rows(result):
    return [dict(r) for r in result.mappings().all()]


def clean_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("216") and len(digits) == 11:
        digits = digits[3:]
    if not re.fullmatch(r"\d{8}", digits):
        raise HTTPException(422, "Numéro de téléphone invalide (8 chiffres).")
    return digits


def place_text(address: str, details: Optional[str]) -> str:
    address = address.strip()
    return f"{address} — {details.strip()}" if details and details.strip() else address


def recipient(name: Optional[str], phone: Optional[str]):
    name = (name or "").strip() or None
    phone = (phone or "").strip() or None
    if bool(name) != bool(phone):
        raise HTTPException(422, "Renseignez le nom et le téléphone du destinataire.")
    return name, (clean_phone(phone) if phone else None)


def allergy_text(allergies: List[str], note: Optional[str]) -> Optional[str]:
    if any(a not in ALLERGENS for a in allergies):
        raise HTTPException(422, "Allergène inconnu.")
    txt = ", ".join(dict.fromkeys(allergies))
    if note and note.strip():
        txt = f"{txt} — {note.strip()}" if txt else note.strip()
    return txt or None


def clean_text(value):
    value = (value or "").strip()
    return value or None


def clean_image(url):
    url = (url or "").strip()
    if not url:
        return None
    if not url.lower().startswith("https://") or len(url) > 500:
        raise HTTPException(422, "La photo doit être un lien https valide.")
    return url


def attach_items(db: Session, orders: list):
    for o in orders:
        o["items"] = []
    if not orders:
        return orders
    q = text("""
        SELECT oi.OrderID, oi.ProductID, p.ProductName, oi.Quantity, oi.UnitPrice
        FROM dbo.OrderItems oi
        JOIN dbo.Products p ON p.ProductID = oi.ProductID
        WHERE oi.OrderID IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    by_id = {o["order_id"]: o for o in orders}
    for oid, pid, name, qty, price in db.execute(q, {"ids": list(by_id)}):
        by_id[oid]["items"].append(
            {"product_id": pid, "name": name, "quantity": qty, "unit_price": price}
        )
    return orders


# ---------- Commerces ----------
MERCHANT_SELECT = """
    SELECT m.MerchantID AS merchant_id, m.MerchantName AS merchant_name,
           m.Category AS category, m.Address AS address, m.IsOpen AS is_open,
           m.ImageUrl AS image_url, ISNULL(m.PrepTimeMin, 30) AS prep_time,
           ISNULL(m.PromoPercent, 0) AS promo_percent, m.IsFood AS is_food,
           CASE WHEN m.Latitude IS NULL THEN 0 ELSE 1 END AS has_location,
           CASE WHEN m.CreatedAt >= DATEADD(day, -30, SYSDATETIME()) THEN 1 ELSE 0 END AS is_new,
           r.total AS rating_count,
           CASE WHEN r.total > 0 THEN CAST(ROUND(100.0 * r.pos / r.total, 0) AS INT) END AS rating_percent
    FROM dbo.Merchants m
    OUTER APPLY (
        SELECT COUNT(*) AS total, SUM(CASE WHEN IsPositive = 1 THEN 1 ELSE 0 END) AS pos
        FROM dbo.Reviews WHERE MerchantID = m.MerchantID
    ) r
"""


def shape(m: dict) -> dict:
    m["is_new"] = bool(m["is_new"])
    m["has_location"] = bool(m["has_location"])
    # Seuils choisis par moi : à ajuster selon vos besoins
    m["top_rated"] = (m["rating_percent"] or 0) >= 95 and m["rating_count"] >= 20
    return m


@router.get("/merchants")
def list_merchants(
    sort: str = Query("top", pattern="^(top|fast|name)$"),
    db: Session = Depends(get_db),
):
    merchants = [shape(m) for m in rows(db.execute(text(MERCHANT_SELECT)))]

    def key(m):
        closed = not m["is_open"]
        name = m["merchant_name"].lower()
        if sort == "fast":
            return (closed, m["prep_time"], name)
        if sort == "name":
            return (closed, name)
        pct = m["rating_percent"]
        return (closed, pct is None, -(pct or 0), -m["rating_count"], name)

    return sorted(merchants, key=key)


@router.get("/merchants/{merchant_id}")
def merchant_detail(merchant_id: int, db: Session = Depends(get_db)):
    row = db.execute(text(MERCHANT_SELECT + " WHERE m.MerchantID = :m"),
                     {"m": merchant_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Commerce introuvable.")
    return shape(dict(row))


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=60), db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    merchants = rows(db.execute(text("""
        SELECT TOP 10 MerchantID AS merchant_id, MerchantName AS merchant_name,
               Category AS category, IsOpen AS is_open
        FROM dbo.Merchants WHERE MerchantName LIKE :q ORDER BY MerchantName
    """), {"q": like}))
    products = rows(db.execute(text("""
        SELECT TOP 20 p.ProductID AS product_id, p.ProductName AS product_name,
               p.Price AS price, m.MerchantID AS merchant_id,
               m.MerchantName AS merchant_name, m.IsOpen AS is_open
        FROM dbo.Products p
        JOIN dbo.Merchants m ON m.MerchantID = p.MerchantID
        WHERE p.IsAvailable = 1 AND p.ProductName LIKE :q
        ORDER BY m.IsOpen DESC, p.ProductName
    """), {"q": like}))
    return {"merchants": merchants, "products": products}


# ---------- Menu public (façon Glovo) ----------
@router.get("/merchants/{merchant_id}/products")
def merchant_menu(merchant_id: int, db: Session = Depends(get_db)):
    menu = rows(db.execute(text("""
        SELECT p.ProductID AS product_id, p.ProductName AS product_name,
               p.Description AS description, p.Price AS price, p.OldPrice AS old_price,
               p.Category AS category, p.ImageUrl AS image_url, ISNULL(s.sold, 0) AS sold
        FROM dbo.Products p
        OUTER APPLY (
            SELECT SUM(oi.Quantity) AS sold
            FROM dbo.OrderItems oi
            JOIN dbo.Orders o ON o.OrderID = oi.OrderID
            WHERE oi.ProductID = p.ProductID AND o.OrderStatus <> 'Cancelled'
        ) s
        WHERE p.MerchantID = :m AND p.IsAvailable = 1
        ORDER BY p.ProductID
    """), {"m": merchant_id}))
    # La photo du commerçant passe d'abord ; l'image d'illustration sert de secours
    return with_images(menu)


# ---------- Devis de livraison (public) ----------
@router.get("/delivery/quote")
def delivery_quote(
    lat: float, lng: float,
    merchant_id: Optional[int] = None,
    plat: Optional[float] = None, plng: Optional[float] = None,
    db: Session = Depends(get_db),
):
    if merchant_id is not None:
        row = db.execute(text("SELECT Latitude, Longitude FROM dbo.Merchants WHERE MerchantID = :m"),
                         {"m": merchant_id}).first()
        if not row:
            raise HTTPException(404, "Commerce introuvable.")
        if row[0] is None:
            raise HTTPException(409, "La position de ce commerce n'est pas encore renseignée.")
        origin = (float(row[0]), float(row[1]))
    elif plat is not None and plng is not None:
        origin = (plat, plng)
    else:
        raise HTTPException(422, "Point de départ manquant.")
    km, fee = quote(origin, (lat, lng))
    return {"distance_km": km, "fee": fee}


# ---------- Commandes du client ----------
class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=50)


class OrderIn(BaseModel):
    merchant_id: int
    address: str = Field(min_length=3, max_length=200)
    details: Optional[str] = Field(default=None, max_length=90)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    recipient_name: Optional[str] = Field(default=None, max_length=150)
    recipient_phone: Optional[str] = Field(default=None, max_length=20)
    allergies: List[str] = Field(default_factory=list, max_length=11)
    allergy_note: Optional[str] = Field(default=None, max_length=150)
    notes: Optional[str] = Field(default=None, max_length=300)
    items: List[OrderItemIn] = Field(min_length=1)


@router.post("/orders", status_code=201)
def create_order(data: OrderIn, user=Depends(require("Customer")), db: Session = Depends(get_db)):
    merchant = db.execute(text("""
        SELECT IsOpen, Address, ISNULL(PromoPercent, 0), Latitude, Longitude
        FROM dbo.Merchants WHERE MerchantID = :m
    """), {"m": data.merchant_id}).first()
    if not merchant:
        raise HTTPException(404, "Commerce introuvable.")
    if not merchant[0]:
        raise HTTPException(409, "Ce commerce est actuellement fermé.")
    if merchant[3] is None:
        raise HTTPException(409, "Ce commerce n'est pas encore disponible à la livraison.")

    # La distance et les frais sont calculés ici, jamais par le navigateur
    km, fee = quote((float(merchant[3]), float(merchant[4])), (data.latitude, data.longitude))
    rname, rphone = recipient(data.recipient_name, data.recipient_phone)
    allergies = allergy_text(data.allergies, data.allergy_note)

    quantities = {}
    for it in data.items:
        quantities[it.product_id] = quantities.get(it.product_id, 0) + it.quantity

    # Les prix viennent de la base (colonne Price), jamais du navigateur ni du prix barré
    q = text("""
        SELECT ProductID, Price FROM dbo.Products
        WHERE MerchantID = :m AND IsAvailable = 1 AND ProductID IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    prices = {r[0]: r[1] for r in db.execute(q, {"m": data.merchant_id, "ids": list(quantities)})}
    if len(prices) != len(quantities):
        raise HTTPException(409, "Un produit n'est plus disponible. Actualisez votre panier.")

    subtotal = sum(prices[pid] * qty for pid, qty in quantities.items())
    discount = (subtotal * Decimal(merchant[2]) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = subtotal - discount + fee
    address = place_text(data.address, data.details)
    lat, lng = round(data.latitude, 6), round(data.longitude, 6)

    try:
        order_id = db.execute(text("""
            INSERT INTO dbo.Orders
                (CustomerID, MerchantID, DeliveryAddress, DeliveryNotes, Subtotal, DiscountAmount,
                 DeliveryFee, TotalAmount, PaymentMethod, DeliveryLatitude, DeliveryLongitude,
                 DistanceKm, RecipientName, RecipientPhone, Allergies)
            OUTPUT INSERTED.OrderID
            VALUES (:c, :m, :a, :n, :s, :d, :f, :t, 'Cash', :lat, :lng, :km, :rn, :rp, :al)
        """), {
            "c": user["id"], "m": data.merchant_id, "a": address, "n": data.notes,
            "s": subtotal, "d": discount, "f": fee, "t": total, "lat": lat, "lng": lng,
            "km": km, "rn": rname, "rp": rphone, "al": allergies,
        }).scalar()
        for pid, qty in quantities.items():
            db.execute(text("""
                INSERT INTO dbo.OrderItems (OrderID, ProductID, Quantity, UnitPrice)
                VALUES (:o, :p, :q, :u)
            """), {"o": order_id, "p": pid, "q": qty, "u": prices[pid]})
        db.execute(text("""
            INSERT INTO dbo.Deliveries
                (OrderID, CustomerID, DeliveryType, PickupAddress, DestinationAddress, DeliveryFee,
                 PickupLatitude, PickupLongitude, DestinationLatitude, DestinationLongitude,
                 RecipientName, RecipientPhone)
            VALUES (:o, :c, 'MerchantOrder', :p, :d, :f, :plat, :plng, :dlat, :dlng, :rn, :rp)
        """), {
            "o": order_id, "c": user["id"], "p": merchant[1], "d": address, "f": fee,
            "plat": merchant[3], "plng": merchant[4], "dlat": lat, "dlng": lng,
            "rn": rname, "rp": rphone,
        })
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Impossible d'enregistrer la commande.")
    return {"order_id": order_id, "subtotal": subtotal, "discount": discount,
            "delivery_fee": fee, "distance_km": km, "total": total}


@router.get("/orders/mine")
def my_orders(user=Depends(require("Customer")), db: Session = Depends(get_db)):
    orders = rows(db.execute(text("""
        SELECT o.OrderID AS order_id, o.MerchantID AS merchant_id,
               m.MerchantName AS merchant_name, o.OrderStatus AS status,
               o.OrderDate AS order_date, o.Subtotal AS subtotal,
               o.DiscountAmount AS discount, o.DeliveryFee AS delivery_fee,
               o.TotalAmount AS total, o.DistanceKm AS distance_km,
               o.RecipientName AS recipient_name, o.Allergies AS allergies,
               (SELECT TOP 1 IsPositive FROM dbo.Reviews rv WHERE rv.OrderID = o.OrderID) AS review
        FROM dbo.Orders o
        JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        WHERE o.CustomerID = :u
        ORDER BY o.OrderDate DESC
    """), {"u": user["id"]}))
    return attach_items(db, orders)


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, user=Depends(require("Customer")), db: Session = Depends(get_db)):
    # Annulation possible seulement tant que le commerçant n'a pas accepté
    res = db.execute(text("""
        UPDATE dbo.Orders
        SET OrderStatus = 'Cancelled'
        WHERE OrderID = :o
          AND CustomerID = :u
          AND OrderStatus = 'Pending'
    """), {"o": order_id, "u": user["id"]})

    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(409, "Cette commande ne peut plus être annulée.")

    # Annuler également la livraison associée si elle est encore en attente ou assignée
    db.execute(text("""
        UPDATE dbo.Deliveries
        SET DeliveryStatus = 'Cancelled'
        WHERE OrderID = :o
          AND DeliveryStatus IN ('Pending', 'Assigned')
    """), {"o": order_id})

    db.commit()
    return {"ok": True}


class ReviewIn(BaseModel):
    positive: bool


@router.post("/orders/{order_id}/review", status_code=201)
def review_order(order_id: int, data: ReviewIn,
                 user=Depends(require("Customer")), db: Session = Depends(get_db)):
    order = db.execute(text("""
        SELECT MerchantID, OrderStatus FROM dbo.Orders
        WHERE OrderID = :o AND CustomerID = :u
    """), {"o": order_id, "u": user["id"]}).first()
    if not order:
        raise HTTPException(404, "Commande introuvable.")
    if order[1] != "Delivered":
        raise HTTPException(409, "Vous pourrez donner votre avis après la livraison.")
    try:
        db.execute(text("""
            INSERT INTO dbo.Reviews (OrderID, CustomerID, MerchantID, IsPositive)
            VALUES (:o, :u, :m, :p)
        """), {"o": order_id, "u": user["id"], "m": order[0], "p": data.positive})
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Vous avez déjà donné votre avis sur cette commande.")
    return {"ok": True}


# ---------- Livraison à la demande ----------
class DeliveryIn(BaseModel):
    pickup_address: str = Field(min_length=3, max_length=200)
    pickup_details: Optional[str] = Field(default=None, max_length=90)
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    destination_address: str = Field(min_length=3, max_length=200)
    destination_details: Optional[str] = Field(default=None, max_length=90)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lng: float = Field(ge=-180, le=180)
    package_description: Optional[str] = Field(default=None, max_length=300)
    recipient_name: Optional[str] = Field(default=None, max_length=150)
    recipient_phone: Optional[str] = Field(default=None, max_length=20)


@router.post("/deliveries", status_code=201)
def create_delivery(data: DeliveryIn, user=Depends(require("Customer")), db: Session = Depends(get_db)):
    km, fee = quote((data.pickup_lat, data.pickup_lng), (data.destination_lat, data.destination_lng))
    rname, rphone = recipient(data.recipient_name, data.recipient_phone)
    try:
        delivery_id = db.execute(text("""
            INSERT INTO dbo.Deliveries
                (CustomerID, DeliveryType, PickupAddress, DestinationAddress, PackageDescription,
                 DeliveryFee, PickupLatitude, PickupLongitude, DestinationLatitude,
                 DestinationLongitude, RecipientName, RecipientPhone)
            OUTPUT INSERTED.DeliveryID
            VALUES (:c, 'OnDemand', :p, :d, :desc, :f, :plat, :plng, :dlat, :dlng, :rn, :rp)
        """), {
            "c": user["id"], "p": place_text(data.pickup_address, data.pickup_details),
            "d": place_text(data.destination_address, data.destination_details),
            "desc": data.package_description, "f": fee,
            "plat": round(data.pickup_lat, 6), "plng": round(data.pickup_lng, 6),
            "dlat": round(data.destination_lat, 6), "dlng": round(data.destination_lng, 6),
            "rn": rname, "rp": rphone,
        }).scalar()
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Impossible d'enregistrer la demande de livraison.")
    return {"delivery_id": delivery_id, "delivery_fee": fee, "distance_km": km}


# ---------- Commerçant : commandes ----------
@router.get("/merchant/orders")
def merchant_orders(user=Depends(require_merchant), db: Session = Depends(get_db)):
    # Le commerçant ne voit ni le téléphone ni l'adresse du client
    orders = rows(db.execute(text("""
        SELECT o.OrderID AS order_id, u.FullName AS customer_name,
               o.OrderStatus AS status, o.OrderDate AS order_date,
               o.Subtotal AS subtotal, o.DeliveryNotes AS notes, o.Allergies AS allergies
        FROM dbo.Orders o
        JOIN dbo.Users u ON u.UserID = o.CustomerID
        WHERE o.MerchantID = :m
          AND (o.OrderStatus NOT IN ('Delivered', 'Cancelled')
               OR o.OrderDate >= DATEADD(day, -2, SYSDATETIME()))
        ORDER BY o.OrderDate DESC
    """), {"m": user["merchant_id"]}))
    return attach_items(db, orders)


# ---------- Commerçant : menu ----------
PRODUCT_COLS = {
    "product_name": "ProductName", "category": "Category", "description": "Description",
    "price": "Price", "old_price": "OldPrice", "image_url": "ImageUrl", "is_available": "IsAvailable",
}


class ProductIn(BaseModel):
    product_name: str = Field(min_length=2, max_length=150)
    category: Optional[str] = Field(default=None, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    price: Decimal = Field(ge=0, le=100000, max_digits=10, decimal_places=2)
    old_price: Optional[Decimal] = Field(default=None, gt=0, le=100000, max_digits=10, decimal_places=2)
    image_url: Optional[str] = Field(default=None, max_length=500)


class ProductPatch(BaseModel):
    product_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    category: Optional[str] = Field(default=None, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    price: Optional[Decimal] = Field(default=None, ge=0, le=100000, max_digits=10, decimal_places=2)
    old_price: Optional[Decimal] = Field(default=None, gt=0, le=100000, max_digits=10, decimal_places=2)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: Optional[bool] = None


@router.get("/merchant/products")
def merchant_products(user=Depends(require_merchant), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT ProductID AS product_id, ProductName AS product_name, Description AS description,
               Price AS price, OldPrice AS old_price, Category AS category,
               ImageUrl AS image_url, IsAvailable AS is_available
        FROM dbo.Products WHERE MerchantID = :m ORDER BY ProductID
    """), {"m": user["merchant_id"]}))


@router.post("/merchant/products", status_code=201)
def merchant_product_add(data: ProductIn, user=Depends(require_merchant), db: Session = Depends(get_db)):
    if data.old_price is not None and data.old_price <= data.price:
        raise HTTPException(422, "Le prix barré doit être supérieur au prix.")
    pid = db.execute(text("""
        INSERT INTO dbo.Products (MerchantID, ProductName, Category, Description, Price, OldPrice, ImageUrl)
        OUTPUT INSERTED.ProductID VALUES (:m, :n, :c, :d, :p, :o, :i)
    """), {
        "m": user["merchant_id"], "n": data.product_name.strip(), "c": clean_text(data.category),
        "d": clean_text(data.description), "p": data.price, "o": data.old_price,
        "i": clean_image(data.image_url),
    }).scalar()
    db.commit()
    return {"product_id": pid}


@router.patch("/merchant/products/{product_id}")
def merchant_product_update(product_id: int, data: ProductPatch,
                            user=Depends(require_merchant), db: Session = Depends(get_db)):
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(422, "Aucune modification.")
    for k in ("product_name", "price", "is_available"):
        if k in changes and changes[k] is None:
            raise HTTPException(422, "Nom, prix et disponibilité ne peuvent pas être vides.")
    cur = db.execute(text("SELECT Price, OldPrice FROM dbo.Products WHERE ProductID = :i AND MerchantID = :m"),
                     {"i": product_id, "m": user["merchant_id"]}).first()
    if not cur:
        raise HTTPException(404, "Produit introuvable.")
    price = changes.get("price", cur[0])
    old = changes["old_price"] if "old_price" in changes else cur[1]
    if old is not None and old <= price:
        raise HTTPException(422, "Le prix barré doit être supérieur au prix. Retirez-le ou corrigez-le.")
    if "image_url" in changes:
        changes["image_url"] = clean_image(changes["image_url"])
    for k in ("category", "description"):
        if k in changes:
            changes[k] = clean_text(changes[k])
    sets = ", ".join(f"{PRODUCT_COLS[k]} = :{k}" for k in changes)
    db.execute(text(f"UPDATE dbo.Products SET {sets} WHERE ProductID = :id AND MerchantID = :m"),
               {**changes, "id": product_id, "m": user["merchant_id"]})
    db.commit()
    return {"ok": True}


# ----- Import d'un menu complet -----
def parse_price(raw: str) -> Decimal:
    s = re.sub(r"(?i)(dt|tnd)", "", raw or "").replace("\u00a0", "").replace(" ", "").replace(",", ".")
    try:
        v = Decimal(s)
    except InvalidOperation:
        raise ValueError("prix invalide")
    if not v.is_finite() or v < 0 or v > 100000:
        raise ValueError("prix invalide")
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def import_menu(db: Session, merchant_id: int, raw: str,
                hide_categories: Optional[List[str]] = None) -> dict:
    lines = [l for l in raw.replace("\r", "").split("\n") if l.strip()]
    if len(lines) > 300:
        raise HTTPException(422, "Maximum 300 lignes à la fois.")
    categories_to_hide = list(dict.fromkeys(
        category.strip() for category in (hide_categories or []) if category and category.strip()
    ))
    if any(len(category) > 60 for category in categories_to_hide):
        raise HTTPException(422, "Nom de catégorie trop long.")
    parsed, errors = [], []
    for n, line in enumerate(lines, start=1):
        cols = [c.strip() for c in line.split(";" if ";" in line else "\t")]
        if n == 1 and cols[0].lower().replace("é", "e").startswith("categorie"):
            continue
        cols += [""] * (6 - len(cols))
        cat, name, price_raw, old_raw, desc, image = cols[:6]
        try:
            if not 2 <= len(name) <= 150:
                raise ValueError("nom du produit manquant ou trop long")
            if len(cat) > 60 or len(desc) > 500:
                raise ValueError("catégorie ou description trop longue")
            price = parse_price(price_raw)
            old = parse_price(old_raw) if old_raw else None
            if old is not None and old <= price:
                raise ValueError("le prix barré doit être supérieur au prix")
            if image and (not image.lower().startswith("https://") or len(image) > 500):
                raise ValueError("la photo doit être un lien https")
        except ValueError as e:
            errors.append(f"Ligne {n} : {e}")
            continue
        parsed.append((cat or None, name, price, old, desc or None, image or None))
    if not errors and not parsed:
        errors.append("Aucune ligne à importer.")
    if errors:
        return {"created": 0, "updated": 0, "hidden": 0, "errors": errors}

    created = updated = 0
    hidden = 0
    try:
        for cat, name, price, old, desc, image in parsed:
            row = db.execute(text("""
                SELECT TOP 1 ProductID FROM dbo.Products WHERE MerchantID = :m AND ProductName = :n
            """), {"m": merchant_id, "n": name}).first()
            if row:
                db.execute(text("""
                    UPDATE dbo.Products
                    SET Category = ISNULL(:c, Category), Description = ISNULL(:d, Description),
                        Price = :p, OldPrice = :o, ImageUrl = ISNULL(:i, ImageUrl), IsAvailable = 1
                    WHERE ProductID = :id
                """), {"c": cat, "d": desc, "p": price, "o": old, "i": image, "id": row[0]})
                updated += 1
            else:
                db.execute(text("""
                    INSERT INTO dbo.Products (MerchantID, ProductName, Category, Description, Price, OldPrice, ImageUrl)
                    VALUES (:m, :n, :c, :d, :p, :o, :i)
                """), {"m": merchant_id, "n": name, "c": cat, "d": desc, "p": price, "o": old, "i": image})
                created += 1
        if categories_to_hide:
            result = db.execute(text("""
                UPDATE dbo.Products
                SET IsAvailable = 0
                WHERE MerchantID = :m AND IsAvailable = 1 AND Category IN :categories
            """).bindparams(bindparam("categories", expanding=True)), {
                "m": merchant_id, "categories": categories_to_hide,
            })
            hidden = max(result.rowcount, 0)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Impossible d'importer le menu.")
    return {"created": created, "updated": updated, "hidden": hidden, "errors": []}


class ImportIn(BaseModel):
    text: str = Field(min_length=3, max_length=60000)
    hide_categories: List[str] = Field(default_factory=list)


@router.post("/merchant/products/import")
def merchant_import(data: ImportIn, user=Depends(require_merchant), db: Session = Depends(get_db)):
    return import_menu(db, user["merchant_id"], data.text, data.hide_categories)


# ----- Photos des articles -----
def drop_file(url):
    if url and PHOTO_RE.match(url):
        try:
            (UPLOAD_DIR / url.rsplit("/", 1)[1]).unlink(missing_ok=True)
        except OSError:
            pass


def product_image(db: Session, merchant_id: int, product_id: int):
    row = db.execute(text("SELECT ImageUrl FROM dbo.Products WHERE ProductID = :i AND MerchantID = :m"),
                     {"i": product_id, "m": merchant_id}).first()
    if not row:
        raise HTTPException(404, "Produit introuvable.")
    return row[0]


def save_photo(db: Session, merchant_id: int, product_id: int, file: UploadFile):
    old = product_image(db, merchant_id, product_id)
    data = file.file.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        raise HTTPException(413, "Photo trop lourde (1,5 Mo maximum).")
    if not data.startswith(b"\xff\xd8\xff") or not data.rstrip(b"\x00").endswith(b"\xff\xd9"):
        raise HTTPException(422, "Format de photo invalide (JPEG attendu).")
    name = uuid.uuid4().hex + ".jpg"
    (UPLOAD_DIR / name).write_bytes(data)
    url = "/uploads/products/" + name
    try:
        db.execute(text("UPDATE dbo.Products SET ImageUrl = :u WHERE ProductID = :i AND MerchantID = :m"),
                   {"u": url, "i": product_id, "m": merchant_id})
        db.commit()
    except Exception:
        db.rollback()
        (UPLOAD_DIR / name).unlink(missing_ok=True)
        raise HTTPException(500, "Impossible d'enregistrer la photo.")
    drop_file(old)
    return {"image_url": url}


def remove_photo(db: Session, merchant_id: int, product_id: int):
    old = product_image(db, merchant_id, product_id)
    db.execute(text("UPDATE dbo.Products SET ImageUrl = NULL WHERE ProductID = :i AND MerchantID = :m"),
               {"i": product_id, "m": merchant_id})
    db.commit()
    drop_file(old)
    return {"ok": True}


@router.post("/merchant/products/{product_id}/image")
def merchant_photo(product_id: int, file: UploadFile = File(...),
                   user=Depends(require_merchant), db: Session = Depends(get_db)):
    return save_photo(db, user["merchant_id"], product_id, file)


@router.delete("/merchant/products/{product_id}/image")
def merchant_photo_remove(product_id: int, user=Depends(require_merchant), db: Session = Depends(get_db)):
    return remove_photo(db, user["merchant_id"], product_id)


# ---------- Livreur ----------
# Une commande est visible des livreurs dès que le client l'envoie.
# Pour ne la montrer qu'après acceptation du commerçant, retirez 'Pending' ici.
VISIBLE = "('Pending', 'Confirmed', 'Preparing', 'Ready')"

DELIVERY_COLS = """
    d.DeliveryID AS delivery_id, d.DeliveryType AS delivery_type,
    d.PickupAddress AS pickup_address, d.DestinationAddress AS destination_address,
    d.PackageDescription AS package_description, d.DeliveryFee AS fee,
    d.DeliveryStatus AS status, d.RequestedAt AS requested_at,
    d.PickupLatitude AS pickup_lat, d.PickupLongitude AS pickup_lng,
    d.DestinationLatitude AS dest_lat, d.DestinationLongitude AS dest_lng,
    o.OrderStatus AS order_status, m.MerchantName AS merchant_name
"""


@router.get("/driver/deliveries/available")
def driver_available(user=Depends(require("Driver")), db: Session = Depends(get_db)):
    return rows(db.execute(text(f"""
        SELECT {DELIVERY_COLS}
        FROM dbo.Deliveries d
        LEFT JOIN dbo.Orders o ON o.OrderID = d.OrderID
        LEFT JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        WHERE d.DriverID IS NULL AND d.DeliveryStatus = 'Pending'
          AND (d.DeliveryType = 'OnDemand' OR o.OrderStatus IN {VISIBLE})
        ORDER BY d.RequestedAt
    """)))


@router.get("/driver/deliveries/mine")
def driver_mine(user=Depends(require("Driver")), db: Session = Depends(get_db)):
    return rows(db.execute(text(f"""
        SELECT {DELIVERY_COLS},
               COALESCE(d.RecipientName, u.FullName) AS customer_name,
               COALESCE(d.RecipientPhone, u.Phone) AS customer_phone,
               CASE WHEN d.RecipientName IS NULL THEN 0 ELSE 1 END AS for_someone_else
        FROM dbo.Deliveries d
        JOIN dbo.Users u ON u.UserID = d.CustomerID
        LEFT JOIN dbo.Orders o ON o.OrderID = d.OrderID
        LEFT JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        WHERE d.DriverID = :d
          AND (d.DeliveryStatus IN ('Assigned', 'PickedUp')
               OR d.DeliveredAt >= DATEADD(day, -1, SYSDATETIME())
               OR (d.DeliveryStatus = 'Cancelled' AND d.AssignedAt >= DATEADD(hour, -2, SYSDATETIME())))
        ORDER BY d.RequestedAt DESC
    """), {"d": user["id"]}))


@router.post("/driver/deliveries/{delivery_id}/accept")
def driver_accept(delivery_id: int, user=Depends(require("Driver")), db: Session = Depends(get_db)):
    res = db.execute(text(f"""
        UPDATE dbo.Deliveries
        SET DriverID = :d, DeliveryStatus = 'Assigned', AssignedAt = SYSDATETIME()
        WHERE DeliveryID = :i AND DriverID IS NULL AND DeliveryStatus = 'Pending'
          AND (DeliveryType = 'OnDemand'
               OR OrderID IN (SELECT OrderID FROM dbo.Orders WHERE OrderStatus IN {VISIBLE}))
    """), {"d": user["id"], "i": delivery_id})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(409, "Cette livraison n'est plus disponible.")
    db.commit()
    return {"ok": True}


@router.post("/driver/deliveries/{delivery_id}/pickup")
def driver_pickup(delivery_id: int, user=Depends(require("Driver")), db: Session = Depends(get_db)):
    # Pour une commande de commerce, le colis ne peut être récupéré qu'une fois « Prête »
    res = db.execute(text("""
        UPDATE dbo.Deliveries SET DeliveryStatus = 'PickedUp', PickedUpAt = SYSDATETIME()
        WHERE DeliveryID = :i AND DriverID = :d AND DeliveryStatus = 'Assigned'
          AND (DeliveryType = 'OnDemand'
               OR OrderID IN (SELECT OrderID FROM dbo.Orders WHERE OrderStatus = 'Ready'))
    """), {"i": delivery_id, "d": user["id"]})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(409, "La commande n'est pas encore prête, ou l'action est impossible.")
    db.execute(text("""
        UPDATE dbo.Orders SET OrderStatus = 'Delivering'
        WHERE OrderID = (SELECT OrderID FROM dbo.Deliveries WHERE DeliveryID = :i)
    """), {"i": delivery_id})
    db.commit()
    return {"ok": True}


# ---------- Administrateur ----------
@router.get("/admin/orders")
def admin_orders(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    orders = rows(db.execute(text("""
        SELECT TOP 200 o.OrderID AS order_id, m.MerchantName AS merchant_name,
               u.FullName AS customer_name, u.Phone AS customer_phone,
               o.DeliveryAddress AS address,
               ISNULL(CAST(o.DistanceKm AS VARCHAR(10)) + ' km', '') AS zone,
               o.Allergies AS allergies, o.RecipientName AS recipient_name,
               o.RecipientPhone AS recipient_phone,
               o.OrderStatus AS status, o.OrderDate AS order_date, o.TotalAmount AS total
        FROM dbo.Orders o
        JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        JOIN dbo.Users u ON u.UserID = o.CustomerID
        ORDER BY o.OrderDate DESC
    """)))
    return attach_items(db, orders)


@router.get("/admin/merchants")
def admin_merchants(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT m.MerchantID AS merchant_id, m.MerchantName AS merchant_name,
               m.Category AS category, m.Address AS address, m.Phone AS phone,
               m.IsOpen AS is_open, u.FullName AS owner_name,
               CASE WHEN m.Latitude IS NULL THEN 0 ELSE 1 END AS has_location
        FROM dbo.Merchants m LEFT JOIN dbo.Users u ON u.UserID = m.OwnerUserID
        ORDER BY m.MerchantName
    """)))


class LocationIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: Optional[str] = Field(default=None, min_length=3, max_length=300)


@router.patch("/admin/merchants/{merchant_id}/location")
def admin_set_location(merchant_id: int, data: LocationIn,
                       user=Depends(require("Admin")), db: Session = Depends(get_db)):
    check_point(data.latitude, data.longitude)
    res = db.execute(text("""
        UPDATE dbo.Merchants
        SET Latitude = :lat, Longitude = :lng, Address = ISNULL(:a, Address)
        WHERE MerchantID = :m
    """), {"lat": round(data.latitude, 6), "lng": round(data.longitude, 6),
           "a": data.address.strip() if data.address else None, "m": merchant_id})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(404, "Commerce introuvable.")
    db.commit()
    return {"ok": True}


@router.get("/admin/merchants/{merchant_id}/products")
def admin_menu(merchant_id: int, user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT ProductID AS product_id, ProductName AS product_name, Category AS category,
               Price AS price, OldPrice AS old_price, ImageUrl AS image_url, IsAvailable AS is_available
        FROM dbo.Products WHERE MerchantID = :m ORDER BY ProductID
    """), {"m": merchant_id}))


@router.post("/admin/merchants/{merchant_id}/products/import")
def admin_import(merchant_id: int, data: ImportIn,
                 user=Depends(require("Admin")), db: Session = Depends(get_db)):
    if not db.execute(text("SELECT 1 FROM dbo.Merchants WHERE MerchantID = :m"), {"m": merchant_id}).first():
        raise HTTPException(404, "Commerce introuvable.")
    return import_menu(db, merchant_id, data.text, data.hide_categories)


@router.post("/admin/merchants/{merchant_id}/products/{product_id}/image")
def admin_photo(merchant_id: int, product_id: int, file: UploadFile = File(...),
                user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return save_photo(db, merchant_id, product_id, file)


@router.delete("/admin/merchants/{merchant_id}/products/{product_id}/image")
def admin_photo_remove(merchant_id: int, product_id: int,
                       user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return remove_photo(db, merchant_id, product_id)
