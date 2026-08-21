import { Disc3, Save, FolderOpen, Download } from "lucide-react";

export function TopBar() {
  return (
    <header className="h-12 shrink-0 border-b border-line bg-bg-panel flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <Disc3 className="w-5 h-5 text-accent" />
        <span className="font-mono text-sm tracking-wider">REMIXR</span>
        <span className="text-xs text-white/40 font-mono">v0.1.0</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <button className="px-3 h-8 rounded bg-bg-card hover:bg-bg-hover text-xs flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5" /> Load preset
        </button>
        <button className="px-3 h-8 rounded bg-bg-card hover:bg-bg-hover text-xs flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" /> Save preset
        </button>
        <button className="px-3 h-8 rounded bg-accent hover:brightness-110 text-xs flex items-center gap-1.5 ml-2">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>
    </header>
  );
}
