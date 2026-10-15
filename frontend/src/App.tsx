import { useEffect } from "react";
import { Upload } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { WaveformView } from "./components/WaveformView";
import { EffectRack } from "./components/EffectRack";
import { PromptPanel } from "./components/PromptPanel";
import { TransportBar } from "./components/TransportBar";
import { usePreviewSync } from "./hooks/usePreviewSync";
import { useShortcuts } from "./hooks/useShortcuts";
import { useLevelMatch } from "./hooks/useLevelMatch";
import { useGlobalDrop } from "./hooks/useGlobalDrop";
import { useTrackStructure } from "./hooks/useTrackStructure";
import { useFlipPreview } from "./hooks/useFlipPreview";
import { useFlipStore } from "./lib/flipStore";
import { FlipSidebar } from "./components/FlipSidebar";
import { FlipTimeline } from "./components/FlipTimeline";
import { FlipTransport } from "./components/FlipTransport";
import { startSession } from "./lib/session";

export default function App() {
  usePreviewSync();
  useShortcuts();
  useLevelMatch();
  useTrackStructure();
  useFlipPreview();
  const flip = useFlipStore((s) => s.view === "flip");
  const dragging = useGlobalDrop();
  useEffect(() => startSession(), []);

  return (
    <div className="h-full flex flex-col relative">
      <TopBar />
      <WaveformView />
      {flip ? (
        <main className="flex-1 flex overflow-hidden">
          <FlipSidebar />
          <FlipTimeline />
        </main>
      ) : (
        <main className="flex-1 flex overflow-hidden">
          <EffectRack />
          <PromptPanel />
        </main>
      )}
      {flip ? <FlipTransport /> : <TransportBar />}

      {dragging && (
        <div className="absolute inset-0 z-[100] bg-bg/80 backdrop-blur-sm border-2 border-dashed border-accent rounded-lg m-2 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Upload className="w-10 h-10 text-accent" />
          <span className="text-lg">Rilascia per caricare la traccia</span>
          <span className="text-xs text-white/40">i parametri del remix restano: stesso remix, nuova canzone</span>
        </div>
      )}
    </div>
  );
}
