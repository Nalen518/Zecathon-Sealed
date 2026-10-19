import { Navigate, Outlet, useLocation } from "react-router";
import { DeskHeader } from "../../components/DeskHeader/DeskHeader";
import { SlimFooter } from "../../components/SlimFooter/SlimFooter";
import { DeskSessionProvider, useDeskSession } from "./DeskSession";
import { Locked } from "./screens/Locked";
import "../../components/TextLink/TextLink.css";
import "../screens/AppScreen.css";

/** Route layout for every /desk page: one key session, and the Locked screen in front of anything that needs the key. */
export function DeskLayout() {
  return (
    <DeskSessionProvider>
      <DeskGate />
    </DeskSessionProvider>
  );
}

function DeskGate() {
  const { record, unlocked, config } = useDeskSession();
  const { pathname } = useLocation();
  const creating = pathname.startsWith("/desk/create");
  const restoring = pathname.startsWith("/desk/restore");

  if (record === undefined) {
    return (
      <div className="app-page">
        <DeskHeader network={config.network} />
        <main id="main" className="app-main">
          <p className="container text-body-default muted" role="status">
            Loading the desk key.
          </p>
        </main>
        <SlimFooter desk />
      </div>
    );
  }
  if (creating || restoring) return <Outlet />;
  // No key in this browser: open the desk from a backup first. Create inbox is one link away (D-90).
  if (record === null) return <Navigate to="/desk/restore" replace />;
  if (!unlocked) return <Locked />;
  return <Outlet />;
}
