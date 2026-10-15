import { useEffect } from "react";
import { flipPlayer } from "../lib/flipPlayer";
import { findClip, findPattern, ops, useFlipStore } from "../lib/flipStore";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";

/**
 * Space = play/pause · B = switch A/B · L = loop · Esc = clear region
 * Ctrl+Z = undo · Ctrl+Shift+Z / Ctrl+Y = redo
 * Flip view: Space/L/undo act on the arrangement · Canc = delete clip ·
 * Ctrl+D = duplicate clip · Esc = deselect
 * Ignored while typing in an input, textarea or select.
 */
export function useShortcuts() {
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const remix = useRemixStore.getState();
      const flip = useFlipStore.getState();
      const inFlip = flip.view === "flip" && !!flip.project;
      const hasTrack = !!useTrackStore.getState().wavesurfer;
      const mod = e.ctrlKey || e.metaKey;
      const undo = inFlip ? flip.undo : remix.undo;
      const redo = inFlip ? flip.redo : remix.redo;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (inFlip && mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const found = findClip(flip.project, flip.selection);
        const pat = findPattern(flip.project, flip.selection);
        if (found) flip.edit(ops.duplicateClip(found.track.id, found.clip.id));
        else if (pat) flip.edit(ops.duplicatePattern(pat.track.id, pat.clip.id));
        return;
      }
      if (mod || e.altKey || !hasTrack) return;

      if (e.code === "Space") {
        e.preventDefault();
        // A focused button would also "click" on keyup: take focus away.
        if (e.target instanceof HTMLButtonElement) e.target.blur();
        if (e.repeat) return;
        if (inFlip) flipPlayer.toggle();
        else player.togglePlay();
        return;
      }

      if (inFlip) {
        if (e.key === "l" || e.key === "L") {
          if (flip.loop) flip.setLoopOn(!flip.loopOn);
        } else if (e.key === "Delete" || e.key === "Backspace") {
          const found = findClip(flip.project, flip.selection);
          const pat = findPattern(flip.project, flip.selection);
          if (found) flip.edit(ops.removeClip(found.track.id, found.clip.id));
          else if (pat) flip.edit(ops.removePattern(pat.track.id, pat.clip.id));
          if (found || pat) flip.select(null);
        } else if (e.key === "Escape") {
          if (flip.selection) flip.select(null);
          else if (remix.region) remix.setRegion(null);
        }
        return;
      }

      if (e.key === "b" || e.key === "B") {
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
