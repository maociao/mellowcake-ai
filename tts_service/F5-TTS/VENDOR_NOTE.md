# F5-TTS Vendored Library

This directory contains a vendored copy of the F5-TTS library (https://github.com/SWivid/F5-TTS).

**Source Date:** 2024-12-08 (Approximate)
**Original Commit:** 305e3ea (Based on backward compatibility patch in utils_infer.py)

## Modifications for Mellowcake AI (AMD/ROCm Support)

The following modifications have been applied to `src/f5_tts/infer/utils_infer.py` to ensure stability on AMD GPUs (ROCm 6.2):

1.  **Float32 Enforcement**:
    -   The `load_model` function in `utils_infer.py` has been modified to strictly enforce `dtype = torch.float32`.
    -   Defaulting to `float16` on AMD Navi31 GPUs caused "Not a Number" (NaN) errors during the generation of longer sequences.

2.  **Disable Flash Attention**:
    -   The `process_batch` function in `utils_infer.py` now wraps the inference call in a context manager:
        ```python
        with torch.inference_mode(), torch.backends.cuda.sdp_kernel(enable_flash=False, enable_math=True, enable_mem_efficient=False):
        ```
    -   This forces PyTorch to use the standard "Math" attention kernel instead of the experimental Flash Attention kernel on ROCm, which was unstable and produced NaNs.

3.  **Tensor Cloning**:
    -   In `process_batch` within `utils_infer.py`, the audio tensor is explicitly cloned before inference (`audio_clone = audio.clone()`).
    -   This prevents potential in-place modifications by the model from corrupting the reference audio for subsequent batches during batched generation.

4.  **Threaded Processing Disabled**:
    -   Original threaded batch processing was replaced with a sequential loop in `utils_infer.py` to prevent race conditions and simplify debugging.

## Maintenance
If you need to update this library, you will need to manually merge changes from the upstream repository, ensuring the above fixes are preserved.
