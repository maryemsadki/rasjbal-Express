import { useState } from "react";
import { Link } from "react-router-dom";
import { categoryIcon, imgSrc } from "../utils";
import HeartButton from "./HeartButton";

export function Cover({ m, big }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={"cover" + (big ? " big" : "")}>
      {m.image_url && !failed ? (
        <img src={imgSrc(m.image_url)} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        categoryIcon(m.category)
      )}
    </div>
  );
}

export function Rating({ percent, count }) {
  if (percent == null) return null;
  return <span className="rating">👍 {percent}% <small>({count})</small></span>;
}

export default function MerchantCard({ m }) {
  return (
    <div className="mc-wrap">
      <Link to={`/merchants/${m.merchant_id}`} className={"card merchant-card" + (m.is_open ? "" : " is-closed")}>
        <Cover m={m} />
        <div className="merchant-info">
          <div className="row-between">
            <h3>{m.merchant_name}</h3>
            <span className={"badge " + (m.is_open ? "open" : "closed")}>
              {m.is_open ? "Ouvert" : "Fermé"}
            </span>
          </div>
          <p className="muted">{m.category}</p>
          {m.promo_percent > 0 && <span className="badge promo">-{m.promo_percent}% sur tout le menu</span>}
          <div className="meta">
            <Rating percent={m.rating_percent} count={m.rating_count} />
            <span>🕒 {m.prep_time}–{m.prep_time + 10} min</span>
            {m.is_new && <span className="badge new">Nouveau</span>}
            {m.top_rated && <span className="badge top">⭐ Top</span>}
          </div>
          <p className="muted small">📍 {m.address}</p>
        </div>
      </Link>
      <HeartButton merchantId={m.merchant_id} />
    </div>
  );
}