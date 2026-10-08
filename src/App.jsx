import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GlobeMap from "./components/GlobeMap";
import HierarchyFlow from "./components/HierarchyFlow";
import HallView from "./components/HallView";
import Icon from "./components/Icon";
import { Segmented, StatusBadge, SidePanel } from "./components/ui";
import { COUNTRIES, ALL_SITES, HIGHLIGHT_NUMERIC, STATUSES, findSite, findHall, countRacks } from "./data/sites";
import { useLang } from "./i18n";

const LAYOUTS = ["A", "B", "C"];

// ?layout=A|B|C — shareable and reload-stable
const readLayout = () => {
  const v = new URLSearchParams(window.location.search).get("layout");
  return LAYOUTS.includes(v) ? v : "A";
};
const writeLayout = (v) => {
  const url = new URL(window.location.href);
  if (v === "A") url.searchParams.delete("layout");
  else url.searchParams.set("layout", v);
  window.history.replaceState(null, "", url);
};

const Legend = () => {
  const { t } = useLang();
  return (
    <div className="legend">
      {STATUSES.map((s) => (
        <span key={s}><i className={`dot dot--${s}`} />{t(`status.${s}`)}</span>
      ))}
    </div>
  );
};

const ModeToggle = ({ mode, setMode }) => {
  const { t } = useLang();
  return (
    <Segmented
      label={t("mode.label")}
      size="sm"
      value={mode}
      onChange={setMode}
      options={[{ key: "3d", label: t("mode.3d") }, { key: "2d", label: t("mode.2d") }]}
    />
  );
};

const SiteSummary = ({ site }) => {
  const { t, pick } = useLang();
  return (
    <div className="summary">
      <div className="summary__title">
        {pick(site.countryName)} · {pick(site.name)}
        <StatusBadge status={site.status}>{t(`status.${site.status}`)}</StatusBadge>
      </div>
      <div className="muted">{t("count.siteDetail", { rooms: site.rooms.length, racks: countRacks(site) })}</div>
      <div className="muted small">{t("panel.hint")}</div>
    </div>
  );
};

// Map wrapper that every layout shares: knows the data, labels and fallback text.
const Globe = (props) => {
  const { t, pick } = useLang();
  const labelOf = useCallback((s) => pick(s.name), [pick]);
  return (
    <GlobeMap
      sites={ALL_SITES}
      highlight={HIGHLIGHT_NUMERIC}
      labelOf={labelOf}
      fallback={t("map.noWebgl")}
      {...props}
    />
  );
};

/* ── A: map + side graph (main layout) ── */
const LayoutA = ({ mode, setMode, openDetail }) => {
  const { t } = useLang();
  const [siteId, setSiteId] = useState(null);
  const site = findSite(siteId);
  const spec = useMemo(() => (site ? { site, depth: 2 } : null), [site]);
  return (
    <div className="grid-a">
      <section className="card">
        <header className="card__head">
          <h2>{t("map.title")}</h2>
          <span className="muted small">{t(mode === "3d" ? "map.hint3d" : "map.hint2d")}</span>
          <span className="spacer" />
          <Legend />
          <ModeToggle mode={mode} setMode={setMode} />
        </header>
        <Globe mode={mode} selectedId={siteId} focusId={siteId} onSelect={setSiteId} className="globe--tall" />
      </section>
      <section className="card">
        <header className="card__head"><h2>{t("panel.title")}</h2></header>
        {site ? (
          <>
            <SiteSummary site={site} />
            <HierarchyFlow graphSpec={spec} onNodeClick={(k, e) => k !== "site" && openDetail(k, e)} className="flow--side" />
          </>
        ) : (
          <div className="empty">{t("panel.empty")}</div>
        )}
      </section>
    </div>
  );
};

/* ── B: drill-down — fly to the site, then swap the stage to its graph ── */
const LayoutB = ({ mode, setMode, openDetail }) => {
  const { t, pick } = useLang();
  const [siteId, setSiteId] = useState(null);
  const [stage, setStage] = useState("map");
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const site = findSite(siteId);
  const spec = useMemo(() => (site ? { site, depth: 2 } : null), [site]);
  const drillTo = (id) => {
    setSiteId(id);
    clearTimeout(timer.current);
    // let the camera arrive first, so the user keeps a sense of where they came from
    timer.current = setTimeout(() => setStage("flow"), 950);
  };
  const back = () => setStage("map");
  return (
    <section className="card">
      <header className="card__head">
        <nav className="crumbs" aria-label="breadcrumb">
          {stage === "flow" ? (
            <button type="button" className="link" onClick={back}>{t("crumb.world")}</button>
          ) : (
            <span>{t("crumb.world")}</span>
          )}
          {site && stage === "flow" && (
            <>
              <Icon name="chevron" /><span>{pick(site.countryName)}</span>
              <Icon name="chevron" /><span>{pick(site.name)}</span>
            </>
          )}
        </nav>
        <span className="spacer" />
        {stage === "map" ? (
          <><Legend /><ModeToggle mode={mode} setMode={setMode} /></>
        ) : (
          <button type="button" className="btn" onClick={back}><Icon name="back" />{t("back")}</button>
        )}
      </header>
      <div className="stage">
        <div className={`stage__layer${stage === "map" ? " is-active" : ""}`}>
          <Globe mode={mode} selectedId={siteId} focusId={siteId} onSelect={drillTo} className="globe--full" />
        </div>
        {site && stage === "flow" && (
          <div className="stage__layer is-active">
            <SiteSummary site={site} />
            <HierarchyFlow graphSpec={spec} onNodeClick={(k, e) => k !== "site" && openDetail(k, e)} className="flow--full" />
          </div>
        )}
      </div>
    </section>
  );
};

/* ── C: global graph first, mini globe as navigator; selection syncs both ways ── */
const GLOBAL_SPEC = { countries: COUNTRIES, depth: 1 };
const LayoutC = ({ mode, setMode, openDetail }) => {
  const { t } = useLang();
  const [siteId, setSiteId] = useState(null);
  const onFlowClick = (kind, e) => {
    if (kind === "site") setSiteId(e.id);
    else if (kind === "room") openDetail(kind, e);
  };
  return (
    <section className="card">
      <header className="card__head">
        <h2>{t("graph.title")}</h2>
        <span className="spacer" />
        <Legend />
        <ModeToggle mode={mode} setMode={setMode} />
      </header>
      <div className="split">
        <HierarchyFlow graphSpec={GLOBAL_SPEC} highlightId={siteId} onNodeClick={onFlowClick} className="flow--full" />
        <div className="split__mini">
          <Globe mode={mode} selectedId={siteId} focusId={siteId} onSelect={setSiteId} className="globe--mini" />
        </div>
      </div>
    </section>
  );
};

const DetailPanel = ({ detail, onClose }) => {
  const { t, pick } = useLang();
  const open = !!detail;
  const racks = !detail ? [] : detail.kind === "room" ? detail.entity.racks : [detail.entity];
  const title = detail ? `${t(`kind.${detail.kind}`)} · ${pick(detail.entity.name)}` : "";
  return (
    <SidePanel open={open} title={title} onClose={onClose} closeLabel={t("close")}>
      <table className="table">
        <thead>
          <tr>
            <th>{t("col.rack")}</th><th>{t("col.u")}</th><th>{t("col.power")}</th>
            <th>{t("col.devices")}</th><th>{t("col.status")}</th>
          </tr>
        </thead>
        <tbody>
          {racks.map((r) => (
            <tr key={r.id}>
              <td>{r.name}<div className="muted small">{r.id}</div></td>
              <td>{r.uUsed}/{r.uTotal}U</td>
              <td>{r.powerKw} kW</td>
              <td>{r.deviceCount}</td>
              <td><StatusBadge status={r.status}>{t(`status.${r.status}`)}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </SidePanel>
  );
};

const App = () => {
  const { t, lang, setLang } = useLang();
  const [layout, setLayoutState] = useState(readLayout);
  const [mode, setMode] = useState("3d");
  const [detail, setDetail] = useState(null);
  const [hallId, setHallId] = useState(null);
  const hallCtx = hallId ? findHall(hallId) : null;
  const setLayout = (v) => { writeLayout(v); setLayoutState(v); };
  // halls open the 3D room; racks open the detail panel
  const openDetail = useCallback((kind, entity) => {
    if (kind === "room") setHallId(entity.id);
    else setDetail({ kind, entity });
  }, []);
  const closeHall = useCallback(() => setHallId(null), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const props = { mode, setMode, openDetail };

  useEffect(() => { document.title = t("app.title"); }, [t]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{t("app.title")}</h1>
          <p className="muted small">{t("app.subtitle", { sites: ALL_SITES.length, countries: COUNTRIES.length })}</p>
        </div>
        <span className="spacer" />
        <Segmented
          label={t("layout.label")}
          value={layout}
          onChange={setLayout}
          options={LAYOUTS.map((k) => ({ key: k, label: t(`layout.${k}`) }))}
        />
        <button
          type="button"
          className="btn"
          aria-label={t("lang.label")}
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        >
          {t("lang.toggle")}
        </button>
      </header>
      <main>
        {/* key remounts the layout so one layout's selection doesn't leak into another */}
        {layout === "A" && <LayoutA key="A" {...props} />}
        {layout === "B" && <LayoutB key="B" {...props} />}
        {layout === "C" && <LayoutC key="C" {...props} />}
      </main>
      <footer className="muted small footer">{t("footer")}</footer>
      <DetailPanel detail={detail} onClose={closeDetail} />
      {hallCtx && <HallView site={hallCtx.site} hall={hallCtx.hall} onClose={closeHall} />}
    </div>
  );
};

export default App;
