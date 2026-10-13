import { createBrowserRouter, RouterProvider } from "react-router";
import { bundled } from "../lib/config";
import { DeskLayout } from "./desk/DeskLayout";
import { AuditTrail } from "./desk/screens/AuditTrail";
import { CreateInbox } from "./desk/screens/CreateInbox";
import { Decrypt } from "./desk/screens/Decrypt";
import { Inbox } from "./desk/screens/Inbox";
import { Locked } from "./desk/screens/Locked";
import { Settings } from "./desk/screens/Settings";
import { TipFlowLayout } from "./flow/TipFlow";
import { ConfigError } from "./screens/ConfigError";
import { Landing } from "./screens/Landing/Landing";
import { NotFound } from "./screens/NotFound";
import { Pay } from "./screens/Pay/Pay";
import { SafetyCheck } from "./screens/SafetyCheck/SafetyCheck";
import { Sent } from "./screens/Sent/Sent";
import { Write } from "./screens/Write/Write";

const router = createBrowserRouter([
  { path: "/", element: <Landing />, errorElement: <NotFound /> },
  { path: "/safety-check", element: <SafetyCheck /> },
  {
    // Write, Pay and Sent share the in-memory tip (TipFlow). Nothing survives a reload.
    element: <TipFlowLayout />,
    errorElement: <NotFound />,
    children: [
      { path: "/write", element: <Write /> },
      { path: "/pay", element: <Pay /> },
      { path: "/sent", element: <Sent /> },
    ],
  },
  {
    // Desk screens share one key session. The private key and token are in memory only while unlocked.
    path: "/desk",
    element: <DeskLayout />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Inbox /> },
      { path: "decrypt", element: <Decrypt /> },
      { path: "audit", element: <AuditTrail /> },
      { path: "settings", element: <Settings /> },
      { path: "create", element: <CreateInbox /> },
      { path: "restore", element: <Locked restore /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  // A broken sealed.config.json blocks every page: sealing to a wrong key must be impossible.
  if (!bundled.ok) return <ConfigError errors={bundled.errors} />;
  return <RouterProvider router={router} />;
}
