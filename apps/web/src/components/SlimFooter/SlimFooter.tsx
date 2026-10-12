import "./SlimFooter.css";

/** Figma: "Footer (slim)" on every app screen (D-05, F-06). One line, no links. Desk screens have their own line. */
export function SlimFooter({ desk = false }: { desk?: boolean }) {
  return (
    <footer className="slim-footer">
      <div className="container">
        <p className="text-mono-label">
          {desk ? "Sealed desk · keys stay in this browser" : "Powered by Sealed, open source · No analytics · No cookies"}
        </p>
      </div>
    </footer>
  );
}
