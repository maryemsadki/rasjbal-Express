from sqlalchemy import text
from database import engine

checks = {
    "Users.PasswordHash": "SELECT COL_LENGTH('dbo.Users','PasswordHash')",
    "Merchants.OwnerUserID": "SELECT COL_LENGTH('dbo.Merchants','OwnerUserID')",
    "Merchants.ImageUrl": "SELECT COL_LENGTH('dbo.Merchants','ImageUrl')",
    "Merchants.PrepTimeMin": "SELECT COL_LENGTH('dbo.Merchants','PrepTimeMin')",
    "Merchants.PromoPercent": "SELECT COL_LENGTH('dbo.Merchants','PromoPercent')",
    "Merchants.Latitude": "SELECT COL_LENGTH('dbo.Merchants','Latitude')",
    "Merchants.Longitude": "SELECT COL_LENGTH('dbo.Merchants','Longitude')",
    "Merchants.IsFood": "SELECT COL_LENGTH('dbo.Merchants','IsFood')",
    "Orders.DeliveryNotes": "SELECT COL_LENGTH('dbo.Orders','DeliveryNotes')",
    "Orders.DiscountAmount": "SELECT COL_LENGTH('dbo.Orders','DiscountAmount')",
    "Orders.DistanceKm": "SELECT COL_LENGTH('dbo.Orders','DistanceKm')",
    "Orders.Allergies": "SELECT COL_LENGTH('dbo.Orders','Allergies')",
    "Deliveries.PickupLatitude": "SELECT COL_LENGTH('dbo.Deliveries','PickupLatitude')",
    "Table Reviews": "SELECT OBJECT_ID('dbo.Reviews')",
    "Table Deliveries": "SELECT OBJECT_ID('dbo.Deliveries')",
}

with engine.connect() as c:
    for name, sql in checks.items():
        ok = c.execute(text(sql)).scalar() is not None
        print(("OK        " if ok else "MANQUANT  ") + name)

    print()
    try:
        from extras import MERCHANT_SELECT
        n = len(c.execute(text(MERCHANT_SELECT)).fetchall())
        print(f"La requete /merchants fonctionne ({n} commerce(s)).")
    except Exception as e:
        print("ERREUR de la requete /merchants :")
        print(e)