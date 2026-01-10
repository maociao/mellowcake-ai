export const CONFIG = {
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL || 'fluffy/l3-8b-stheno-v3.2',
    COMFY_URL: process.env.COMFY_URL || 'http://127.0.0.1:8188',
    COMFY_IMAGE_MODEL: process.env.COMFY_IMAGE_MODEL || 'realcartoonRealistic_v17.safetensors',
    COMFY_VIDEO_UNET_HIGH: process.env.COMFY_VIDEO_UNET_HIGH || 'Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf',
    COMFY_VIDEO_UNET_LOW: process.env.COMFY_VIDEO_UNET_LOW || 'Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf',
    COMFY_VIDEO_VAE: process.env.COMFY_VIDEO_VAE || 'wan_2.1_vae.safetensors',
    COMFY_VIDEO_CLIP: process.env.COMFY_VIDEO_CLIP || 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_LLM_PROMPTS: process.env.LOG_LLM_PROMPTS === 'true',
    LOG_COMFY_WORKFLOWS: process.env.LOG_COMFY_WORKFLOWS === 'true',
};
