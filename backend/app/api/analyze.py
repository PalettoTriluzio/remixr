from fastapi import APIRouter, HTTPException

from app.analysis.features import compute_peaks, compute_spectrum, estimate_bpm, estimate_key
from app.audio.loader import load_audio
from app.models import AnalyzeResponse
from app.storage import find_upload

router = APIRouter()

# Analysis SR: 22050 is standard for librosa MIR tasks (BPM/key), fast enough.
ANALYSIS_SR = 22050


@router.get("/analyze/{track_id}", response_model=AnalyzeResponse)
def analyze(track_id: str):
    path = find_upload(track_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Track not found")

    try:
        samples, sr = load_audio(path, target_sr=ANALYSIS_SR, mono=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Load failed: {e}") from e

    y_mono = samples[0]

    try:
        bpm = estimate_bpm(y_mono, sr)
        key = estimate_key(y_mono, sr)
        peaks = compute_peaks(y_mono, n_points=2000)
        spectrum = compute_spectrum(y_mono, sr, n_mels=128)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}") from e

    return AnalyzeResponse(
        track_id=track_id,
        bpm=round(bpm, 1),
        key=key,
        peaks=peaks,
        spectrum=spectrum,
    )
