from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from extras import (
    ProductIn, ProductPatch, drop_file, merchant_product_add,
    merchant_product_update, parse_price, rows,
)
from security import require, require_merchant

router = APIRouter()


def ensure_merchant(db: Session, merchant_id: int):
    if not db.execute(text("SELECT 1 FROM dbo.Merchants WHERE MerchantID = :m"), {"m": merchant_id}).first():
        raise HTTPException(404, "Commerce introuvable.")


# ---------- Produits : liste de tous les commerces ----------
@router.get("/admin/products")
def admin_products(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT TOP 3000 p.ProductID AS product_id, p.MerchantID AS merchant_id,
               m.MerchantName AS merchant_name, p.ProductName AS product_name,
               p.Category AS category, p.Description AS description, p.Price AS price,
               p.OldPrice AS old_price, p.ImageUrl AS image_url,
               p.ImageIsStock AS stock_image, p.IsAvailable AS is_available
        FROM dbo.Products p
        JOIN dbo.Merchants m ON m.MerchantID = p.MerchantID
        ORDER BY m.MerchantName, p.ProductID
    """)))


# ---------- Produits : ajout, modification (mêmes règles que côté commerçant) ----------
@router.post("/admin/merchants/{merchant_id}/products", status_code=201)
def admin_product_add(merchant_id: int, data: ProductIn,
                      user=Depends(require("Admin")), db: Session = Depends(get_db)):
    ensure_merchant(db, merchant_id)
    return merchant_product_add(data, {"merchant_id": merchant_id}, db)


@router.patch("/admin/merchants/{merchant_id}/products/{product_id}")
def admin_product_update(merchant_id: int, product_id: int, data: ProductPatch,
                         user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return merchant_product_update(product_id, data, {"merchant_id": merchant_id}, db)


# ---------- Produits : suppression ----------
def delete_product(db: Session, merchant_id: int, product_id: int):
    row = db.execute(text("SELECT ImageUrl FROM dbo.Products WHERE ProductID = :i AND MerchantID = :m"),
                     {"i": product_id, "m": merchant_id}).first()
    if not row:
        raise HTTPException(404, "Produit introuvable.")
    # Un article déjà commandé ne peut pas disparaître (historique des commandes) : on le masque
    used = db.execute(text("SELECT TOP 1 1 FROM dbo.OrderItems WHERE ProductID = :i"), {"i": product_id}).first()
    if used:
        db.execute(text("UPDATE dbo.Products SET IsAvailable = 0 WHERE ProductID = :i"), {"i": product_id})
        db.commit()
        return {"deleted": False, "hidden": True}
    db.execute(text("DELETE FROM dbo.Products WHERE ProductID = :i AND MerchantID = :m"),
               {"i": product_id, "m": merchant_id})
    db.commit()
    drop_file(row[0])
    return {"deleted": True, "hidden": False}


@router.delete("/admin/merchants/{merchant_id}/products/{product_id}")
def admin_product_delete(merchant_id: int, product_id: int,
                         user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return delete_product(db, merchant_id, product_id)


@router.delete("/merchant/products/{product_id}")
def merchant_product_delete(product_id: int, user=Depends(require_merchant), db: Session = Depends(get_db)):
    return delete_product(db, user["merchant_id"], product_id)


# ---------- Catégories ----------
@router.get("/admin/categories")
def admin_categories(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT p.MerchantID AS merchant_id, m.MerchantName AS merchant_name,
               p.Category AS category, COUNT(*) AS products
        FROM dbo.Products p
        JOIN dbo.Merchants m ON m.MerchantID = p.MerchantID
        GROUP BY p.MerchantID, m.MerchantName, p.Category
        ORDER BY m.MerchantName, MIN(p.ProductID)
    """)))


class RenameIn(BaseModel):
    old: Optional[str] = Field(default="", max_length=60)
    new: Optional[str] = Field(default="", max_length=60)


@router.patch("/admin/merchants/{merchant_id}/categories")
def admin_category_rename(merchant_id: int, data: RenameIn,
                          user=Depends(require("Admin")), db: Session = Depends(get_db)):
    # Renommer vers un nom existant fusionne les deux catégories ; un nom vide = « sans catégorie »
    old = (data.old or "").strip()
    new = (data.new or "").strip() or None
    res = db.execute(text("""
        UPDATE dbo.Products SET Category = :n
        WHERE MerchantID = :m AND ISNULL(Category, N'') = :o
    """), {"n": new, "m": merchant_id, "o": old})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(404, "Catégorie introuvable.")
    db.commit()
    return {"updated": res.rowcount}


# ---------- Clients ----------
@router.get("/admin/customers")
def admin_customers(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT TOP 500 u.UserID AS id, u.FullName AS full_name, u.Phone AS phone,
               u.IsActive AS is_active, u.CreatedAt AS created_at,
               (SELECT COUNT(*) FROM dbo.Orders o WHERE o.CustomerID = u.UserID) AS orders
        FROM dbo.Users u
        WHERE u.UserRole = 'Customer'
        ORDER BY u.CreatedAt DESC
    """)))


# ---------- Importation : aperçu sans rien écrire ----------
class PreviewIn(BaseModel):
    text: str = Field(min_length=3, max_length=60000)


@router.post("/admin/merchants/{merchant_id}/products/import/preview")
def import_preview(merchant_id: int, data: PreviewIn,
                   user=Depends(require("Admin")), db: Session = Depends(get_db)):
    ensure_merchant(db, merchant_id)
    lines = [l for l in data.text.replace("\r", "").split("\n") if l.strip()]
    if len(lines) > 300:
        raise HTTPException(422, "Maximum 300 lignes à la fois.")

    existing = {
        (name or "").strip().lower(): price
        for name, price in db.execute(
            text("SELECT ProductName, Price FROM dbo.Products WHERE MerchantID = :m"), {"m": merchant_id}
        )
    }

    out, seen = [], {}
    for n, line in enumerate(lines, start=1):
        cols = [c.strip() for c in line.split(";" if ";" in line else "\t")]
        if n == 1 and cols[0].lower().replace("é", "e").startswith("categorie"):
            continue
        cols += [""] * (6 - len(cols))
        cat, name, price_raw, old_raw, desc, image = cols[:6]
        row = {"line": n, "category": cat or None, "name": name, "price": None, "old_price": None,
               "status": "new", "message": "", "current_price": None}
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
            key = name.lower()
            if key in seen:
                raise ValueError(f"doublon avec la ligne {seen[key]}")
            seen[key] = n
            row["price"] = float(price)
            row["old_price"] = float(old) if old is not None else None
            if key in existing:
                row["status"] = "update"
                row["current_price"] = float(existing[key])
        except ValueError as e:
            row["status"] = "error"
            row["message"] = str(e)
        out.append(row)

    summary = {"new": 0, "update": 0, "error": 0, "total": len(out)}
    for r in out:
        summary[r["status"]] += 1
    return {"rows": out, "summary": summary}