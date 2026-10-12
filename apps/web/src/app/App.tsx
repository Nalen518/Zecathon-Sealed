import { createBrowserRouter, RouterProvider } from "react-router";
import { bundled } from "../lib/config";
import { ConfigError } from "./screens/ConfigError";
import { Landing } from "./screens/Landing/Landing";
import { NotFound } from "./screens/NotFound";

const router = createBrowserRouter([
  { path: "/", element: <Landing />, errorElement: <NotFound /> },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  // A broken sealed.config.json blocks every page: sealing to a wrong key must be impossible.
  if (!bundled.ok) return <ConfigError errors={bundled.errors} />;
  return <RouterProvider router={router} />;
}
