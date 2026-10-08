// Tiny UI primitives for the demo: segmented control, status badge, side panel.
import { useEffect, useId } from "react";
import Icon from "./Icon";

export const Segmented = ({ label, options, value, onChange, size }) => {
  const name = useId();
  return (
    <div className={`segmented${size === "sm" ? " segmented--sm" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.key} className={`segmented__item${o.key === value ? " is-active" : ""}`}>
          <input
            type="radio"
            name={name}
            value={o.key}
            checked={o.key === value}
            onChange={() => onChange(o.key)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
};

export const StatusBadge = ({ status, children }) => (
  <span className={`badge badge--${status}`}>{children}</span>
);

export const SidePanel = ({ open, title, onClose, closeLabel, children }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sidepanel" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sidepanel__scrim" aria-label={closeLabel} onClick={onClose} />
      <aside className="sidepanel__body">
        <header className="sidepanel__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="sidepanel__content">{children}</div>
      </aside>
    </div>
  );
};
