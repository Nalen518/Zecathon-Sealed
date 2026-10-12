import { createBrowserRouter, RouterProvider } from "react-router";
import { bundled } from "../lib/config";
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
  { path: "*", element: <NotFound /> },
]);

export function App() {
  // A broken sealed.config.json blocks every page: sealing to a wrong key must be impossible.
  if (!bundled.ok) return <ConfigError errors={bundled.errors} />;
  return <RouterProvider router={router} />;
}
