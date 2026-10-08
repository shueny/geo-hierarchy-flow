// Full-screen 3D view of one hall: the scene plus a side panel with the hall
// summary, the selected rack, and layout controls. Rack positions are kept per
// hall in localStorage so a rearranged floor survives a reload.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HallScene from "./HallScene";
import HallFlow from "./HallFlow";
import Icon from "./Icon";
import { Segmented, StatusBadge } from "./ui";
import { defaultLayout, moveRack, restoreLayout, rotateRack } from "./hallLayout";
import { STATUSES } from "../data/sites";
import { useLang } from "../i18n";

const storageKey = (hallId) => `geo-hierarchy-flow.hall.${hallId}`;
const load = (hallId) => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(hallId)) || "null");
  } catch {
    return null;
  }
};
const save = (hallId, racks) => {
  try {
    window.localStorage.setItem(storageKey(hallId), JSON.stringify(racks));
  } catch {
    /* storage unavailable: the layout still works for this visit */
  }
};
const clear = (hallId) => {
  try {
    window.localStorage.removeItem(storageKey(hallId));
  } catch {
    /* nothing to clear */
  }
};

// direction the rack front faces, as seen in the top view (+z is down on screen)
const FACING = ["↓", "→", "↑", "←"];

const HallView = ({ site, hall, onClose }) => {
  const { t, pick } = useLang();
  const base = useMemo(() => defaultLayout(hall.racks.map((r) => r.id)), [hall]);
  const [layout, setLayout] = useState(() => restoreLayout(base, load(hall.id)));
  const [selectedId, setSelectedId] = useState(null);
  const [colorMode, setColorMode] = useState("status");
  const [mode, setMode] = useState("3d"); // "3d" scene or "2d" React Flow plan — same layout state
  const [view, setView] = useState("perspective");
  const [showLabels, setShowLabels] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(0);
  const closeRef = useRef(null);

  const racksById = useMemo(() => Object.fromEntries(hall.racks.map((r) => [r.id, r])), [hall]);
  const selected = selectedId ? racksById[selectedId] : null;
  const moved = Object.keys(layout.racks).some((id) => {
    const a = layout.racks[id];
    const b = base.racks[id];
    return a.x !== b.x || a.z !== b.z || a.rot !== b.rot;
  });

  const flash = useCallback((msg) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2500);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const commit = useCallback((next) => {
    setLayout(next);
    save(hall.id, next.racks);
  }, [hall.id]);

  const onMove = useCallback((id, pos) => {
    const next = moveRack(layout, id, pos);
    if (next) commit(next);
    else flash(t("hall.blocked"));
  }, [layout, commit, flash, t]);

  const rotate = useCallback(() => {
    if (!selectedId) return;
    const next = rotateRack(layout, selectedId);
    if (next) commit(next);
    else flash(t("hall.blockedRotate"));
  }, [layout, selectedId, commit, flash, t]);

  const reset = () => {
    clear(hall.id);
    setLayout(base);
    flash(t("hall.resetDone"));
  };

  // keyboard: R rotates the selected rack, Esc closes
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if (e.key === "Escape") onClose();
      else if (!typing && (e.key === "r" || e.key === "R")) rotate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate, onClose]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  const totals = useMemo(() => {
    const kw = hall.racks.reduce((n, r) => n + r.powerKw, 0);
    const used = hall.racks.reduce((n, r) => n + r.uUsed, 0);
    const total = hall.racks.reduce((n, r) => n + r.uTotal, 0);
    return { kw: Math.round(kw * 10) / 10, pct: Math.round((used / total) * 100) };
  }, [hall]);

  const pos = selectedId ? layout.racks[selectedId] : null;

  return (
    <div className="hallview" role="dialog" aria-modal="true" aria-label={`${pick(site.name)} · ${pick(hall.name)}`}>
      <header className="hallview__head">
        <nav className="crumbs" aria-label="breadcrumb">
          <span>{pick(site.countryName)}</span>
          <Icon name="chevron" />
          <span>{pick(site.name)}</span>
          <Icon name="chevron" />
          <span>{pick(hall.name)}</span>
        </nav>
        <span className="muted small">{hall.floor}</span>
        <span className="spacer" />
        <Segmented
          label={t("hall.mode")}
          value={mode}
          onChange={setMode}
          options={[{ key: "3d", label: t("hall.mode3d") }, { key: "2d", label: t("hall.mode2d") }]}
        />
        <button ref={closeRef} type="button" className="btn" onClick={onClose}>
          <Icon name="close" />{t("close")}
        </button>
      </header>

      <div className="hallview__body">
        {mode === "2d" ? (
          <HallFlow
            layout={layout}
            racks={racksById}
            selectedId={selectedId}
            colorMode={colorMode}
            onSelect={setSelectedId}
            onMove={onMove}
            onBlocked={() => flash(t("hall.blocked"))}
            className="hallview__scene"
          />
        ) : (
        <HallScene
          key={hall.id}
          layout={layout}
          racks={racksById}
          selectedId={selectedId}
          colorMode={colorMode}
          showLabels={showLabels}
          view={view}
          onSelect={setSelectedId}
          onMove={onMove}
          onBlocked={() => flash(t("hall.blocked"))}
          fallback={t("map.noWebgl")}
          className="hallview__scene"
        />
        )}
        <p className="hallview__notice" role="status" aria-live="polite">{notice}</p>

        <aside className="hallview__side">
          <section>
            <h3>{t("hall.summary")}</h3>
            <dl className="stats">
              <div><dt>{t("hall.racks")}</dt><dd>{hall.racks.length}</dd></div>
              <div><dt>{t("col.power")}</dt><dd>{totals.kw} kW</dd></div>
              <div><dt>{t("hall.uAvg")}</dt><dd>{totals.pct}%</dd></div>
            </dl>
            <div className="legend legend--wrap">
              {STATUSES.map((s) => (
                <span key={s}>
                  <i className={`dot dot--${s}`} />
                  {t(`status.${s}`)} {hall.racks.filter((r) => r.status === s).length}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3>{t("hall.selected")}</h3>
            {selected ? (
              <div className="rackcard">
                <div className="rackcard__title">
                  {selected.name}
                  <StatusBadge status={selected.status}>{t(`status.${selected.status}`)}</StatusBadge>
                </div>
                <div className="muted small">{selected.id}</div>
                <dl className="stats stats--rack">
                  <div><dt>{t("col.u")}</dt><dd>{selected.uUsed}/{selected.uTotal}U</dd></div>
                  <div><dt>{t("col.power")}</dt><dd>{selected.powerKw} kW</dd></div>
                  <div><dt>{t("col.devices")}</dt><dd>{selected.deviceCount}</dd></div>
                  <div><dt>{t("hall.position")}</dt><dd>({pos.x}, {pos.z}) · {t("hall.facing")} {FACING[pos.rot]}</dd></div>
                </dl>
                <div className="u-bar" role="meter" aria-valuenow={selected.uUsed} aria-valuemin={0} aria-valuemax={selected.uTotal} aria-label={t("col.u")}>
                  <div style={{ width: `${(selected.uUsed / selected.uTotal) * 100}%` }} />
                </div>
                <button type="button" className="btn btn--block" onClick={rotate}>{t("hall.rotate")}</button>
              </div>
            ) : (
              <p className="muted small">{t("hall.pickRack")}</p>
            )}
          </section>

          <section className="controls">
            <h3>{t("hall.display")}</h3>
            {mode === "3d" && (
              <Segmented
                label={t("hall.view")}
                size="sm"
                value={view}
                onChange={setView}
                options={[{ key: "perspective", label: t("hall.view3d") }, { key: "top", label: t("hall.viewTop") }]}
              />
            )}
            <Segmented
              label={t("hall.colorBy")}
              size="sm"
              value={colorMode}
              onChange={setColorMode}
              options={[{ key: "status", label: t("col.status") }, { key: "usage", label: t("col.u") }]}
            />
            {colorMode === "usage" && (
              <div className="ramp" aria-hidden="true"><span>0%</span><i /><span>100%</span></div>
            )}
            {mode === "3d" && (
              <label className="check">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                {t("hall.showLabels")}
              </label>
            )}
            <button type="button" className="btn btn--block" onClick={reset} disabled={!moved}>{t("hall.reset")}</button>
          </section>

          <section>
            <h3>{t("hall.howto")}</h3>
            <ul className="howto muted small">
              <li>{t("hall.tipDrag")}</li>
              <li>{t("hall.tipRotate")}</li>
              <li>{t(mode === "3d" ? "hall.tipCamera" : "hall.tipCamera2d")}</li>
              <li>{t("hall.tipAisles")}</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default HallView;
