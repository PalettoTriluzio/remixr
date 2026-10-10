import { create } from "zustand";
import type WaveSurfer from "wavesurfer.js";
import type { AnalyzeResponse, UploadResponse } from "./types";
import { api } from "./api";
import { useRemixStore } from "./remixStore";

interface TrackState {
  track: UploadResponse | null;
  analysis: AnalyzeResponse | null;
  isUploading: boolean;
  isAnalyzing: boolean;
  error: string | null;

  // Playback (wavesurfer instance is set by WaveformView on mount)
  wavesurfer: WaveSurfer | null;
  isPlaying: boolean;
  currentTime: number;
  setWavesurfer: (ws: WaveSurfer | null) => void;
  setPlaying: (v: boolean) => void;
  setCurrentTime: (t: number) => void;

  uploadFile: (file: File) => Promise<void>;
  reset: () => void;
}

export const useTrackStore = create<TrackState>((set, get) => ({
  track: null,
  analysis: null,
  isUploading: false,
  isAnalyzing: false,
  error: null,

  wavesurfer: null,
  isPlaying: false,
  currentTime: 0,
  setWavesurfer: (ws) => set({ wavesurfer: ws, isPlaying: false, currentTime: 0 }),
  setPlaying: (v) => set({ isPlaying: v }),
  setCurrentTime: (t) => set({ currentTime: t }),
  // Play/pause goes through lib/player.ts (A/B aware).

  uploadFile: async (file: File) => {
    useRemixStore.getState().resetSession();
    set({ isUploading: true, error: null, track: null, analysis: null });
    try {
      const track = await api.upload(file);
      set({ track, isUploading: false, isAnalyzing: true });

      // Fire analysis in the background — waveform can already render from the audio URL
      try {
        const analysis = await api.analyze(track.track_id);
        // Only apply if the same track is still selected
        if (get().track?.track_id === track.track_id) {
          set({ analysis, isAnalyzing: false });
        }
      } catch (analyzeErr) {
        set({
          isAnalyzing: false,
          error: `Analysis failed: ${(analyzeErr as Error).message}`,
        });
      }
    } catch (uploadErr) {
      set({
        isUploading: false,
        isAnalyzing: false,
        error: `Upload failed: ${(uploadErr as Error).message}`,
      });
    }
  },

  reset: () => {
    useRemixStore.getState().resetSession();
    set({
      track: null, analysis: null, error: null,
      isUploading: false, isAnalyzing: false,
      wavesurfer: null, isPlaying: false, currentTime: 0,
    });
  },
}));

export const audioUrl = (trackId: string) => `/api/audio/${trackId}`;
