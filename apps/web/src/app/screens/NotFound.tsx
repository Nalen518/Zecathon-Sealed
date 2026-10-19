import { Button } from "../../components/Button/Button";
import { bundled } from "../../lib/config";
import { SiteHeader } from "../../components/SiteHeader/SiteHeader";
import "./SimpleScreen.css";

/** Unknown route. Not drawn in Figma (D-37). Keeps React Router's default page, which uses inline styles, away. */
export function NotFound() {
  const network = bundled.ok ? bundled.config.network : "test";
  return (
    <>
      <SiteHeader network={network} />
      <main id="main" className="simple-screen container">
        <h1 className="text-heading-h2">This page does not exist</h1>
        <p className="text-body-lead simple-screen-lead">Check the address, or go back to the tip line.</p>
        <div>
          <Button variant="primary" to="/">
            Go to the tip line
          </Button>
        </div>
      </main>
    </>
  );
}
