export default function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={"tab-btn" + (value === t.key ? " active" : "")} onClick={() => onChange(t.key)}>
          {t.label}
          {t.badge > 0 && <b className="tab-badge">{t.badge}</b>}
        </button>
      ))}
    </div>
  );
}