import torch
import time
print(f"Torch: {torch.__version__}")
print(f"CUDA Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"Device: {torch.cuda.get_device_name(0)}")
    x = torch.randn(4096, 4096, device='cuda')
    torch.cuda.synchronize()
    start = time.time()
    for _ in range(10):
        y = torch.matmul(x, x)
    torch.cuda.synchronize()
    print(f"10x 4k Matmul Time: {time.time() - start:.4f}s")
else:
    print("CUDA not available.")
