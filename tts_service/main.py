import os
import sys
import shutil
import uuid
import traceback
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import torch
import uvicorn

# Add F5-TTS to path
sys.path.append(os.path.join(os.path.dirname(__file__), "F5-TTS/src"))

from f5_tts.api import F5TTS

app = FastAPI()

# Global variable for the model
tts = None

def load_model():
    global tts
    if tts is None:
        print("Loading F5-TTS model...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")
        try:
            tts = F5TTS(device=device)
            print("F5-TTS model loaded successfully.")
        except Exception as e:
            print(f"Error loading model: {e}")
            traceback.print_exc()
            sys.exit(1)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.on_event("startup")
async def startup_event():
    load_model()

@app.post("/generate")
async def generate_tts(
    text: str = Form(...),
    reference_audio: UploadFile = File(...),
    reference_text: str = Form(""),
    speed: float = Form(1.0),
):
    try:
        # Save reference audio
        ref_filename = f"{uuid.uuid4()}_{reference_audio.filename}"
        ref_path = os.path.join(UPLOAD_DIR, ref_filename)
        with open(ref_path, "wb") as buffer:
            shutil.copyfileobj(reference_audio.file, buffer)

        # Generate output filename
        out_filename = f"{uuid.uuid4()}.wav"
        out_path = os.path.join(OUTPUT_DIR, out_filename)

        print(f"Generating TTS for text: {text[:50]}...")
        print(f"Reference audio: {ref_path}")
        print(f"Reference text: {reference_text}")
        print(f"Speed: {speed}")

        # Infer
        wav, sr, spec = tts.infer(
            ref_file=ref_path,
            ref_text=reference_text,
            gen_text=text,
            file_wave=out_path,
            speed=speed,
        )

        return FileResponse(out_path, media_type="audio/wav", filename="generated.wav")

    except Exception as e:
        print(f"Error generating TTS: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
