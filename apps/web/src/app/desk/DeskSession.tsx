import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SealedApi } from "../../lib/api";
import { wipe } from "../../lib/bytes";
import { bundled, type SealedConfig } from "../../lib/config";
import {
  loadWrappedDesk,
  rewrapWithToken,
  saveWrappedDesk,
  unlockDesk,
  type UnlockedDesk,
  type WrappedDesk,
} from "../../lib/keystore";

/**
 * The desk's key session (FR-7, api-contract §7).
 * - The wrapped record lives in IndexedDB. The unlocked private key, token and derived key live here, in memory.
 * - Locks on "Lock inbox", after 15 minutes without activity, on a 401, and when the tab closes.
 * - Never writes the key, token or passphrase anywhere else.
 */
export const IDLE_LOCK_MS = 15 * 60 * 1000;

interface DeskSessionValue {
  config: SealedConfig;
  api: SealedApi;
  /** undefined while IndexedDB loads, null when this browser has no desk key. */
  record: WrappedDesk | null | undefined;
  unlocked: UnlockedDesk | null;
  unlock: (passphrase: string, from?: WrappedDesk) => Promise<boolean>;
  /** Save a freshly wrapped record and unlock it (Create inbox step 1, Restore). */
  adopt: (record: WrappedDesk, passphrase: string) => Promise<boolean>;
  lock: () => void;
  /** Store a new token (create, rotate) or drop it (delete, 401) inside the wrapped record (C-11). */
  setToken: (token: string | null) => Promise<void>;
}

const DeskSessionContext = createContext<DeskSessionValue | null>(null);

export function DeskSessionProvider({ children }: { children: ReactNode }) {
  if (!bundled.ok) throw new Error("Desk session needs a valid config");
  const config = bundled.config;
  const api = useMemo(() => new SealedApi(config.apiBaseUrl), [config.apiBaseUrl]);
  const [record, setRecord] = useState<WrappedDesk | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<UnlockedDesk | null>(null);
  const unlockedRef = useRef<UnlockedDesk | null>(null);

  useEffect(() => {
    let live = true;
    loadWrappedDesk().then(
      (r) => live && setRecord(r),
      () => live && setRecord(null),
    );
    return () => {
      live = false;
    };
  }, []);

  const lock = useCallback(() => {
    const u = unlockedRef.current;
    if (u) {
      wipe(u.secrets.privateKey);
      wipe(u.kek);
    }
    unlockedRef.current = null;
    setUnlocked(null);
  }, []);

  const unlock = useCallback(async (passphrase: string, from?: WrappedDesk) => {
    const target = from ?? record;
    if (!target) return false;
    const result = await unlockDesk(target, passphrase);
    if (!result) return false;
    unlockedRef.current = result;
    setUnlocked(result);
    return true;
  }, [record]);

  const adopt = useCallback(
    async (next: WrappedDesk, passphrase: string) => {
      const result = await unlockDesk(next, passphrase);
      if (!result) return false;
      await saveWrappedDesk(next);
      setRecord(next);
      unlockedRef.current = result;
      setUnlocked(result);
      return true;
    },
    [],
  );

  const setToken = useCallback(
    async (token: string | null) => {
      const u = unlockedRef.current;
      if (!u || !record) throw new Error("Desk is locked");
      const next = await rewrapWithToken(record, u, token);
      await saveWrappedDesk(next);
      setRecord(next);
      const updated = { ...u, secrets: { ...u.secrets, token } };
      unlockedRef.current = updated;
      setUnlocked(updated);
    },
    [record],
  );

  // Lock after 15 minutes without activity (api-contract §7).
  useEffect(() => {
    if (!unlocked) return;
    let timer = window.setTimeout(lock, IDLE_LOCK_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [unlocked, lock]);

  // Wipe on unmount (leaving the desk routes).
  useEffect(() => lock, [lock]);

  const value = useMemo(
    () => ({ config, api, record, unlocked, unlock, adopt, lock, setToken }),
    [config, api, record, unlocked, unlock, adopt, lock, setToken],
  );
  return <DeskSessionContext.Provider value={value}>{children}</DeskSessionContext.Provider>;
}

export function useDeskSession(): DeskSessionValue {
  const v = useContext(DeskSessionContext);
  if (!v) throw new Error("useDeskSession must be used inside DeskSessionProvider");
  return v;
}
