import { useEffect, useState } from "react";
import { fetchLanguages } from "../lib/api";
import { BUNDLED_LANGUAGES } from "../lib/languages";
import type { Language } from "../lib/types";

export function useLanguages(): Language[] {
  const [langs, setLangs] = useState<Language[]>(BUNDLED_LANGUAGES);
  useEffect(() => {
    let cancelled = false;
    fetchLanguages()
      .then((remote) => {
        if (!cancelled && remote.length) setLangs(remote);
      })
      .catch(() => {
        /* keep bundled fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return langs;
}
