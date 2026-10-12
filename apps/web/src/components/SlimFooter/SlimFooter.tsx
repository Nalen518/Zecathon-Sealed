import "./SlimFooter.css";

/** Figma: "Footer (slim)" on every app screen (D-05, F-06). One line, no links. */
export function SlimFooter() {
  return (
    <footer className="slim-footer">
      <div className="container">
        <p className="text-mono-label">Powered by Sealed, open source · No analytics · No cookies</p>
      </div>
    </footer>
  );
}
