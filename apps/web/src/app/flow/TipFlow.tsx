import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Outlet } from "react-router";
import { wipe } from "../../lib/bytes";
import { sealTip, type SealedTip } from "../../lib/seal";

/**
 * The sender's tip and sealed memo, in memory only (api-contract §7, rules §1.5).
 * Never written to storage, a URL or a log. Cleared on Leave, after "I've sent it",
 * or when the tab closes. Lives above the Write, Pay and Sent routes so it survives
 * moving between them and nothing else.
 */
interface TipFlowValue {
  text: string;
  setText: (text: string) => void;
  sealed: SealedTip | null;
  /** Seal the current text to the desk key. Editing the text afterwards drops the sealed memo. */
  seal: (deskPublicKey: Uint8Array) => Promise<void>;
  /** The sender says the payment went out: wipe everything and remember only that. */
  markSent: () => void;
  sent: boolean;
  /** Counts successful seals. The seal moment (D-70) plays once per count, never on Back or a reload. */
  sealCount: number;
  /** The last seal count whose seal moment has played. */
  sealMomentShown: { current: number };
  discard: () => void;
}

const TipFlowContext = createContext<TipFlowValue | null>(null);

export function TipFlowProvider({ children }: { children: ReactNode }) {
  const [text, setTextState] = useState("");
  const [sealed, setSealed] = useState<SealedTip | null>(null);
  const [sent, setSent] = useState(false);
  const [sealCount, setSealCount] = useState(0);
  const sealMomentShown = useRef(0);
  const sealedRef = useRef<SealedTip | null>(null);

  const dropSealed = useCallback(() => {
    wipe(sealedRef.current?.memoBytes);
    sealedRef.current = null;
    setSealed(null);
  }, []);

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      if (sealedRef.current) dropSealed();
      setSent(false);
    },
    [dropSealed],
  );

  const seal = useCallback(
    async (deskPublicKey: Uint8Array) => {
      dropSealed();
      const result = await sealTip(text, deskPublicKey);
      sealedRef.current = result;
      setSealed(result);
      setSealCount((n) => n + 1);
    },
    [text, dropSealed],
  );

  const discard = useCallback(() => {
    dropSealed();
    setTextState("");
    setSent(false);
  }, [dropSealed]);

  const markSent = useCallback(() => {
    dropSealed();
    setTextState("");
    setSent(true);
  }, [dropSealed]);

  const value = useMemo(
    () => ({ text, setText, sealed, seal, markSent, sent, discard, sealCount, sealMomentShown }),
    [text, setText, sealed, seal, markSent, sent, discard, sealCount],
  );
  return <TipFlowContext.Provider value={value}>{children}</TipFlowContext.Provider>;
}

export function useTipFlow(): TipFlowValue {
  const value = useContext(TipFlowContext);
  if (!value) throw new Error("useTipFlow must be used inside TipFlowProvider");
  return value;
}

/** Route layout for Write, Pay and Sent. */
export function TipFlowLayout() {
  return (
    <TipFlowProvider>
      <Outlet />
    </TipFlowProvider>
  );
}
