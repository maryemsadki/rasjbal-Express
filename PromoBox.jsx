import { useState } from "react";
import { fmt } from "../utils";

export default function PromoBox({ promo, applyError, onApply, onRemove }) {
  const [value, setValue] = useState("");

  if (promo.code) {
    return (
      <div className="card promo-box">
        <div className="row-between">
          <span>
            🏷️ Code <b>{promo.code}</b>
            {promo.loading ? " …" : promo.error ? "" : ` : -${fmt(promo.discount)}`}
          </span>
          <button type="button" className="link danger" onClick={onRemove}>Retirer</button>
        </div>
        {promo.error && <div className="alert">{promo.error}</div>}
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    const code = value.trim().toUpperCase();
    if (code) {
      onApply(code);
      setValue("");
    }
  };

  return (
    <div className="card promo-box">
      <form onSubmit={submit} className="promo-form">
        <input
          className="input"
          placeholder="🏷️ Code promo"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={30}
          autoCapitalize="characters"
          aria-label="Code promo"
        />
        <button className="btn btn-outline btn-small" disabled={!value.trim()}>Appliquer</button>
      </form>
      {applyError && <div className="alert">{applyError}</div>}
    </div>
  );
}