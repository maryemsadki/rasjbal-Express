from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from extras import rows
from security import require_merchant

router = APIRouter()


# Menu complet du restaurant connecté (articles disponibles ou non)
@router.get("/merchant/menu")
def merchant_full_menu(user=Depends(require_merchant), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT ProductID AS product_id, ProductName AS product_name, Description AS description,
               Price AS price, OldPrice AS old_price, Category AS category,
               ImageUrl AS image_url, ImageIsStock AS stock_image, IsAvailable AS is_available
        FROM dbo.Products WHERE MerchantID = :m ORDER BY ProductID
    """), {"m": user["merchant_id"]}))


class RenameIn(BaseModel):
    old: Optional[str] = Field(default="", max_length=60)
    new: Optional[str] = Field(default="", max_length=60)


# Renommer une catégorie ; un nom déjà existant les fusionne ; un nom vide = « Sans catégorie »
@router.patch("/merchant/categories")
def merchant_category_rename(data: RenameIn, user=Depends(require_merchant), db: Session = Depends(get_db)):
    old = (data.old or "").strip()
    new = (data.new or "").strip() or None
    res = db.execute(text("""
        UPDATE dbo.Products SET Category = :n
        WHERE MerchantID = :m AND ISNULL(Category, N'') = :o
    """), {"n": new, "m": user["merchant_id"], "o": old})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(404, "Catégorie introuvable.")
    db.commit()
    return {"updated": res.rowcount}