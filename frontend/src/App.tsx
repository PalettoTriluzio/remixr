import { TopBar } from "./components/TopBar";
import { WaveformView } from "./components/WaveformView";
import { EffectRack } from "./components/EffectRack";
import { PromptPanel } from "./components/PromptPanel";
import { TransportBar } from "./components/TransportBar";

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <WaveformView />
      <main className="flex-1 flex overflow-hidden">
        <EffectRack />
        <PromptPanel />
      </main>
      <TransportBar />
    </div>
  );
}
