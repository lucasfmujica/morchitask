"use client";

import { useEffect, useState } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * Always false during SSR and the first client render, then corrected in an
 * effect — so it never causes a hydration mismatch. Use it only for state the
 * layout can't express (a section that starts open on a wide screen and closed
 * on a phone); anything purely visual belongs in a Tailwind breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to an external store
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
