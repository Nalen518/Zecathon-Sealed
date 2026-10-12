import { useEffect, useState } from "react";
import { checkDesk, type DeskStatus } from "../lib/config";

/**
 * Checks the bundled desk key against its fingerprint once per page.
 * Returns null while libsodium loads (a few milliseconds).
 */
export function useDeskStatus(): DeskStatus | null {
  const [status, setStatus] = useState<DeskStatus | null>(null);
  useEffect(() => {
    let live = true;
    checkDesk().then(
      (s) => live && setStatus(s),
      () => live && setStatus({ kind: "invalid", config: null, errors: ["The crypto library did not load"] }),
    );
    return () => {
      live = false;
    };
  }, []);
  return status;
}
