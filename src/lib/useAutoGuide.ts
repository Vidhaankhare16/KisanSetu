"use client";
import { useEffect, useState } from "react";

// Auto-opens the starter guide once per browser session (so judges see it the
// moment they open the app), while letting the "How it works" button reopen it
// any time. Uses sessionStorage so a refresh during the same session won't nag.
const KEY = "kisansetu.guideSeen";

export function useAutoGuide(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(KEY)) {
      // sessionStorage is client-only, so this one-time sync must live in an
      // effect (a state initializer would break SSR/hydration).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
      sessionStorage.setItem(KEY, "1");
    }
  }, []);

  return [open, setOpen];
}
