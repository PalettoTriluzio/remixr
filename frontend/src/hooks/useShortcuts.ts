import { useEffect } from "react";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";

/**
 * Space = play/pause · B = switch A/B · L = loop · Esc = clear region
 * Ctrl+Z = undo · Ctrl+Shift+Z / Ctrl+Y = redo
 * Ignored while typing in an input, textarea or select.
 */
export function useShortcuts() {
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const remix = useRemixStore.getState();
      const hasTrack = !!useTrackStore.getState().wavesurfer;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) remix.redo();
        else remix.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        remix.redo();
        return;
      }
      if (mod || e.altKey || !hasTrack) return;

      if (e.code === "Space") {
        e.preventDefault();
        // A focused button would also "click" on keyup: take focus away.
        if (e.target instanceof HTMLButtonElement) e.target.blur();
        if (!e.repeat) player.togglePlay();
      } else if (e.key === "b" || e.key === "B") {
        player.toggleMode();
      } else if (e.key === "l" || e.key === "L") {
        player.setLoop(!remix.loop);
      } else if (e.key === "Escape" && remix.region) {
        remix.setRegion(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
