import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../hooks";
import { useAddress } from "../AddressContext";
import { fmt, isValidPhone, normalizePhone } from "../utils";
import PageHeader from "../components/PageHeader";
import LocationBar from "../components/LocationBar";
import AddressPicker from "../components/AddressPicker";
import RecipientForm from "../components/RecipientForm";

export default function OnDemandDelivery() {
  const [params] = useSearchParams();
  const pharmacy = params.get("type") === "pharmacy";

  const { current } = useAddress();
  const [pickup, setPickup] = useState(null);
  const [picking, setPicking] = useState(false);
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState({
    on: false,
    name: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  const quote = useFetch(
    () =>
      pickup && current
        ? api.quote({
            plat: pickup.lat,
            plng: pickup.lng,
            lat: current.lat,
            lng: current.lng,
          })
        : Promise.resolve(null),
    [pickup?.lat, pickup?.lng, current?.lat, current?.lng]
  );

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!pickup) {
      return setError(
        pharmacy
          ? "Choisissez l'adresse de la pharmacie."
          : "Choisissez l'adresse de collecte."
      );
    }

    if (!current) {
      return setError("Choisissez l'adresse de livraison.");
    }

    if (pharmacy && description.trim().length < 3) {
      return setError(
        "Indiquez le nom de la pharmacie et le nom sous lequel la commande est préparée."
      );
    }

    if (!quote.data) {
      return setError(
        quote.error || "Les frais ne sont pas encore calculés."
      );
    }

    if (recipient.on) {
      if (recipient.name.trim().length < 2) {
        return setError("Indiquez le nom du destinataire.");
      }

      if (!isValidPhone(recipient.phone)) {
        return setError(
          "Le téléphone du destinataire doit contenir 8 chiffres."
        );
      }
    }

    const text = description.trim();
    setSending(true);

    try {
      setDone(
        await api.createDelivery({
          pickup_address: pickup.line,
          pickup_details: pickup.details || null,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,

          destination_address: current.line,
          destination_details: current.details || null,
          destination_lat: current.lat,
          destination_lng: current.lng,

          package_description: pharmacy
            ? `[Pharmacie] ${text}`
            : text || null,

          recipient_name: recipient.on
            ? recipient.name.trim()
            : null,

          recipient_phone: recipient.on
            ? normalizePhone(recipient.phone)
            : null,
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="page">
        <PageHeader title={pharmacy ? "Pharmacie" : "Livraison"} />

        <div className="state">
          <div className="state-icon">✅</div>

          <h3>Demande envoyée !</h3>

          <p className="muted">
            Demande n°{done.delivery_id} · Frais :{" "}
            {fmt(done.delivery_fee)}
          </p>

          <p className="muted">
            Un livreur sera bientôt assigné. Suivez-la dans « Commandes ».
          </p>

          <Link to="/orders" className="btn btn-primary">
            Suivre ma livraison
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={pharmacy ? "💊 Pharmacie" : "Livraison à la demande"}
        subtitle={
          pharmacy
            ? "Faites livrer vos médicaments"
            : "Un colis ? Un achat ? On s'en occupe."
        }
      />

      <form onSubmit={submit} className="stack">
        <div className="card stack-sm">
          <button
            type="button"
            className="row-btn"
            onClick={() => setPicking(true)}
          >
            <span>
              🟢 <b>
                {pharmacy
                  ? "Adresse de la pharmacie"
                  : "Adresse de collecte"}
              </b>
              <br />

              <small className="muted">
                {pickup
                  ? `${pickup.line}${
                      pickup.details ? " — " + pickup.details : ""
                    }`
                  : pharmacy
                  ? "Où se trouve votre pharmacie ?"
                  : "Où récupérer le colis ?"}
              </small>
            </span>

            <span>›</span>
          </button>
        </div>

        <p className="field-label">Livrer à</p>

        <LocationBar />

        <RecipientForm
          value={recipient}
          onChange={setRecipient}
        />

        <label className="field">
          {pharmacy
            ? "Nom de la pharmacie et nom de la commande"
            : "Description du colis"}

          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            placeholder={
              pharmacy
                ? "Ex : Pharmacie Trifi, sac au nom de Maryem"
                : "Ex : petit carton, documents…"
            }
          />
        </label>

        <div className="card summary">
          <div className="row-between total">
            <span>
              Frais
              {quote.data
                ? ` (${String(quote.data.distance_km).replace(".", ",")} km)`
                : ""}
            </span>

            <span>
              {quote.data ? fmt(quote.data.fee) : "—"}
            </span>
          </div>

          <p className="muted small">
            Tarifs de démonstration, paiement en espèces.
          </p>
        </div>

        {quote.error && (
          <div className="alert">{quote.error}</div>
        )}

        {error && <div className="alert">{error}</div>}

        <button
          className="btn btn-primary btn-block"
          disabled={sending || !quote.data}
        >
          {sending
            ? "Envoi en cours…"
            : "Demander la livraison"}
        </button>
      </form>

      {picking && (
        <AddressPicker
          simple
          title={
            pharmacy
              ? "Adresse de la pharmacie"
              : "Adresse de collecte"
          }
          initial={pickup}
          onClose={() => setPicking(false)}
          onSave={(a) => {
            setPickup(a);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}