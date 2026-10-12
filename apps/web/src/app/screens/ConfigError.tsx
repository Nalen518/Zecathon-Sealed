import { Callout } from "../../components/Callout/Callout";
import "./SimpleScreen.css";

/**
 * Shown instead of every page when sealed.config.json is broken. Not drawn in Figma (D-37).
 * No route renders, so no tip can be sealed to a wrong or missing key.
 */
export function ConfigError({ errors }: { errors: string[] }) {
  return (
    <main id="main" className="simple-screen container">
      <h1 className="text-heading-h2">This tip line is set up wrong</h1>
      <Callout tone="warning" title="Do not send a tip from this page" role="alert">
        The page configuration has errors, so it cannot seal a tip safely. If you run this tip line, fix
        sealed.config.json and deploy again.
      </Callout>
      <ul className="simple-screen-errors text-mono-label">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </main>
  );
}
