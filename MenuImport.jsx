import { useState } from "react";

export default function MenuImport({ onImport, onDone }) {
  const [text, setText] = useState("");
  const [hideCategories, setHideCategories] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setText(await file.text());
      setMessage(`Fichier chargé : ${file.name}`);
      setError("");
    } catch (err) {
      setError(err.message || "Impossible de lire ce fichier.");
      setMessage("");
    }
  }

  async function handleImport(event) {
    event.preventDefault();

    if (!text.trim()) {
      setError("Sélectionne un fichier CSV ou colle le menu à importer.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const categories = hideCategories
        .split(",")
        .map((category) => category.trim())
        .filter(Boolean);
      const result = await onImport(text, categories);

      if (result.errors?.length) {
        setError(result.errors.join("\n"));
        return;
      }

      const hidden = result.hidden || 0;
      setMessage(
        `Importation terminée : ${result.created} créé(s), ${result.updated} mis à jour, ${hidden} masqué(s).`
      );
      await onDone?.();
    } catch (err) {
      setError(err.message || "Erreur pendant l'importation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="menu-import">
      <h3>Importer un menu CSV</h3>

      <form onSubmit={handleImport}>
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={handleFileChange}
          disabled={loading}
        />
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder="Catégorie;Produit;Prix;Ancien prix;Description;Image"
          aria-label="Contenu du menu"
          disabled={loading}
        />
        <label className="small">
          Catégories à masquer après l’import (facultatif, séparées par des virgules)
          <input
            className="input"
            value={hideCategories}
            onChange={(event) => setHideCategories(event.target.value)}
            placeholder="Ex. Sodas"
            disabled={loading}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Importation..." : "Importer"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert" style={{ whiteSpace: "pre-line" }}>{error}</p>}
    </section>
  );
}