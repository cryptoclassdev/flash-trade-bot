"use client";

import { useEffect } from "react";
import { track, type EventName } from "@/lib/analytics";

/**
 * Fires a funnel event exactly once on client mount. Used on each
 * screen so we can measure drop-off through the wizard.
 */
export function TrackMount({ event }: { event: EventName }) {
  useEffect(() => {
    track(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
