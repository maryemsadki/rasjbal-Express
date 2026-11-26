import { useRef, useState } from "react";
import { compressImage } from "../photo";
import { imgSrc } from "../utils";

export default function PhotoPicker({ url, onUpload, onRemove, size = 64 }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const blob = await compressImage(file);
      await onUpload(blob);
      setFailed(false);
    } catch (error) {
      alert(error.message || "Échec de l'envoi de la photo.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Retirer cette photo ?")) return;

    setBusy(true);
    try {
      await onRemove();
      setFailed(false);
    } catch (error) {
      alert(error.message || "Impossible de supprimer la photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-pick" style={{ width: size, height: size }}>
      <button
        type="button"
        className="photo-btn"
        disabled={busy}
        onClick={() => input.current?.click()}
        aria-label="Choisir une photo"
      >
        {url && !failed ? (
          <img src={imgSrc(url)} alt="Photo de l'article" onError={() => setFailed(true)} />
        ) : (
          <span>📷</span>
        )}
        <em>{busy ? "Envoi…" : url && !failed ? "Changer" : "Photo"}</em>
      </button>

      {url && onRemove && (
        <button
          type="button"
          className="photo-x"
          disabled={busy}
          onClick={remove}
          aria-label="Retirer la photo"
        >
          ✕
        </button>
      )}

      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}