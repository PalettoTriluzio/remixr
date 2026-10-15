
const PCS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

/** "A minor" + 3 → "C minor". */
export function transposeKey(key: string, semitones: number): string {
  const [tonic = "C", mode = ""] = key.trim().split(/\s+/);
  const i = PCS.indexOf(FLATS[tonic] ?? tonic);
  if (i < 0 || !Number.isFinite(semitones)) return key;
  const j = (((i + Math.round(semitones)) % 12) + 12) % 12;
  return mode ? `${PCS[j]} ${mode}` : PCS[j];
}
