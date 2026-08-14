import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { api } from "@/src/utils/api";

type Manifestation = any;

type Ctx = {
  active: Manifestation | null;
  // Distinguishes "haven't checked yet" from "confirmed there's no active manifestation" —
  // mirrors the same manifestLoaded pattern each screen used to keep locally.
  manifestLoaded: boolean;
  // Re-fetches /manifestations/active from the server and updates every screen at once.
  refresh: () => Promise<Manifestation | null>;
  // Direct setter for a screen that just mutated the manifestation itself (ritual completed,
  // deleted, created) and already has the new value from its own API call — pushes it to every
  // OTHER mounted screen immediately, without a redundant refetch.
  setActive: (m: Manifestation | null) => void;
};

const ManifestationContext = createContext<Ctx>({} as any);

export const useManifestation = () => useContext(ManifestationContext);

// Centralizes the "does the user have an active manifestation" fact so Home, Ritual, and
// Settings all read/write the SAME state instead of each independently fetching + caching it
// locally. Without this, a mutation on one tab (delete, complete ritual, create new) only
// reaches OTHER tabs once the user manually navigates to them (each screen's own
// useFocusEffect-triggered fetch) — this Context makes the update reach every mounted screen
// the instant it happens, reactive tab or not.
export function ManifestationProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState<Manifestation | null>(null);
  const [manifestLoaded, setManifestLoaded] = useState(false);
  const inFlightRef = useRef<Promise<Manifestation | null> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const m = await api<Manifestation | null>("/manifestations/active");
        setActiveState(m);
        return m;
      } catch {
        return null;
      } finally {
        setManifestLoaded(true);
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = p;
    return p;
  }, []);

  const setActive = useCallback((m: Manifestation | null) => {
    setActiveState(m);
    setManifestLoaded(true);
  }, []);

  return (
    <ManifestationContext.Provider value={{ active, manifestLoaded, refresh, setActive }}>
      {children}
    </ManifestationContext.Provider>
  );
}
