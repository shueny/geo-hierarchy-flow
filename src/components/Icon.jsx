// Small inline stroke icons, so the demo has no icon-font dependency.
const PATHS = {
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3",
  building: "M4 21V4h11v17M15 9h5v12M2 21h20M8 8h3M8 12h3M8 16h3",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  rack: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h6",
  back: "M15 18l-6-6l6-6",
  chevron: "M9 6l6 6l-6 6",
  close: "M6 6l12 12M18 6L6 18",
};

const Icon = ({ name, size = 14 }) => (
  <svg
    className="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={PATHS[name]} />
  </svg>
);

export default Icon;
