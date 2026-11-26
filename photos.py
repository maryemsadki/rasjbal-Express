import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from security import require, require_merchant

router = APIRouter()


def rows(result):
    return [dict(r) for r in result.mappings().all()]


# ---------- Photos des articles ----------
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads" / "products"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_PHOTO = 1_500_000  # 1,5 Mo : le navigateur réduit la photo avant l'envoi
PHOTO_RE = re.compile(r"^/uploads/products/[0-9a-f]{32}\.jpg$")


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


@router.get("/admin/merchants/{merchant_id}/products")
def admin_menu(merchant_id: int, user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT ProductID AS product_id, ProductName AS product_name, Category AS category,
               Price AS price, OldPrice AS old_price, ImageUrl AS image_url, IsAvailable AS is_available
        FROM dbo.Products WHERE MerchantID = :m ORDER BY ProductID
    """), {"m": merchant_id}))


@router.post("/admin/merchants/{merchant_id}/products/{product_id}/image")
def admin_photo(merchant_id: int, product_id: int, file: UploadFile = File(...),
                user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return save_photo(db, merchant_id, product_id, file)


@router.delete("/admin/merchants/{merchant_id}/products/{product_id}/image")
def admin_photo_remove(merchant_id: int, product_id: int,
                       user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return remove_photo(db, merchant_id, product_id)


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