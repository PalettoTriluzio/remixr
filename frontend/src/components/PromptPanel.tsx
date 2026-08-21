import { Sparkles, Send } from "lucide-react";

export function PromptPanel() {
  return (
    <section className="flex-1 flex flex-col bg-bg">
      <div className="h-9 border-b border-line bg-bg-panel/95 backdrop-blur px-3 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" /> AI REMIX
        </span>
        <span className="text-xs text-white/30">local LLM · Qwen2.5</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-white/30 text-sm italic">
          Describe the remix you want (e.g. "make it a lo-fi chillhop version, warmer, slower BPM").
          <br />Suggestions and diff of parameter changes will appear here. (F4)
        </div>
      </div>

      <div className="border-t border-line p-3 bg-bg-panel">
        <div className="flex gap-2">
          <textarea
            disabled
            placeholder="Prompt disabled until F4…"
            className="flex-1 bg-bg-card border border-line rounded-md px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-accent disabled:opacity-40"
          />
          <button
            disabled
            className="bg-accent hover:brightness-110 disabled:opacity-40 rounded-md px-4 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-white/40">Genre template:</span>
          <select disabled className="bg-bg-card border border-line rounded text-xs px-2 py-1 disabled:opacity-40">
            <option>none</option>
            <option>house</option>
            <option>lo-fi</option>
            <option>rock</option>
            <option>trap</option>
          </select>
        </div>
      </div>
    </section>
  );
}
