import { useCallback, useRef, useState, type DragEvent } from "react";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { useTrackStore } from "../lib/store";

const ACCEPTED = ".mp3,.wav,.flac,.m4a,.aac,.ogg";
const ACCEPTED_LABEL = "MP3, WAV, FLAC, M4A, AAC, OGG";

export function Dropzone() {
  const { uploadFile, isUploading, isAnalyzing, error } = useTrackStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={openPicker}
      className={`h-full flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
        dragging ? "bg-accent/10 border-accent" : "text-white/40 hover:text-white/60"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = "";
        }}
      />
      {isUploading ? (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <span className="text-sm">Uploading…</span>
        </>
      ) : isAnalyzing ? (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-accent-cool" />
          <span className="text-sm">Analyzing (BPM · key · spectrum)…</span>
        </>
      ) : error ? (
        <>
          <AlertCircle className="w-8 h-8 text-accent-hot" />
          <span className="text-sm text-accent-hot">{error}</span>
          <span className="text-xs text-white/40">click to try another file</span>
        </>
      ) : (
        <>
          <Upload className="w-8 h-8" />
          <span className="text-sm">Drop audio file here or click to browse</span>
          <span className="text-xs text-white/20">{ACCEPTED_LABEL} · max 200 MB</span>
        </>
      )}
    </div>
  );
}
