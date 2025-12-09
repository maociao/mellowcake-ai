import time
import torch
print("Importing F5TTS...")
try:
    from f5_tts.api import F5TTS
    print("F5TTS imported.")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading model on {device}...")
    tts = F5TTS(device=device)
    
    text = "This is a test of the speech generation system."
    # Create a dummy reference audio file if needed, but F5TTS might need a real one.
    # The API usage in main.py looks like: tts.infer(ref_file, ref_text, gen_text, file_wave, speed)
    # We need a reference audio.
    # We can skip actual interference if we just want to test matmul speed inside the context, 
    # but the user complaint is about generation.
    # Minimal test: let's assuming we don't have a ref audio easily. 
    # We can try to use a dummy or just check basic torch op speed inside the venv again with the env var toggled.
    # Re-running the matmul test with/without env var is easier and safer.
    
    # Actually, let's just do the matmul test again but loop it to be significant.
    x = torch.randn(4096, 4096, device=device)
    torch.cuda.synchronize()
    start = time.time()
    for _ in range(10):
        y = torch.matmul(x, x)
    torch.cuda.synchronize()
    print(f"10x 4k Matmul Time: {time.time() - start:.4f}s")
    
except Exception as e:
    print(f"Error: {e}")
