import { useEffect } from "react";
import { levels } from "../lib/peaks";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";

/** Keep the player's A/B trim equal to the RMS difference of the preview window. */
export function useLevelMatch() {
  const view = useRemixStore((s) => s.previewView);
  const on = useRemixStore((s) => s.levelMatch);
  const original = useTrackStore((s) => s.originalBuffer);

  useEffect(() => {
    if (!on || !view || !original) {
      player.setTrim(0);
      return;
    }
    const a = levels(original, view.start, view.end).rmsDb;
    const b = levels(view.buffer).rmsDb;
    // Silence on either side: nothing sensible to match.
    player.setTrim(a < -90 || b < -90 ? 0 : a - b);
  }, [on, view, original]);
}
