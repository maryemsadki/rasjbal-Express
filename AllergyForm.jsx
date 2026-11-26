import { useState } from "react";
import { ALLERGENS } from "../utils";

export default function AllergyForm({ value, onChange }) {
  const [open, setOpen] = useState(true);

  const selectedAllergies = value?.list ?? [];
  const note = value?.note ?? "";

  const toggle = (allergen) => {
    const list = selectedAllergies.includes(allergen)
      ? selectedAllergies.filter((item) => item !== allergen)
      : [...selectedAllergies, allergen];

    onChange({
      ...value,
      list,
      note,
    });
  };

  return (
    <div className="card stack-sm">
      <button
        type="button"
        className="row-btn"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <span>
          ⚠️ <b>Allergies alimentaires</b>
          {selectedAllergies.length > 0 && (
            <em className="count">{selectedAllergies.length}</em>
          )}
        </span>

        <span>{open ? "▾" : "›"}</span>
      </button>

      {open && (
        <>
          <p className="muted small">
            Sélectionnez les allergènes dont le commerce doit être informé.
          </p>

          <div className="chips wrap">
            {ALLERGENS.map((allergen) => {
              const selected = selectedAllergies.includes(allergen);

              return (
                <button
                  type="button"
                  key={allergen}
                  className={`chip ${selected ? "active" : ""}`}
                  onClick={() => toggle(allergen)}
                  aria-pressed={selected}
                >
                  {selected ? "✓ " : ""}
                  {allergen}
                </button>
              );
            })}
          </div>

          <label className="field">
            Autre allergie ou précision (facultatif)
            <input
              className="input"
              type="text"
              placeholder="Ex. : allergie sévère aux arachides"
              maxLength={150}
              value={note}
              onChange={(event) =>
                onChange({
                  ...value,
                  list: selectedAllergies,
                  note: event.target.value,
                })
              }
            />
          </label>

          <p className="muted small">
            Ces informations seront transmises au commerce. Vérifiez auprès
            de lui la composition des plats : l'absence d'allergènes ne peut
            pas être garantie.
          </p>
        </>
      )}
    </div>
  );
}