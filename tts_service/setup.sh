#!/bin/bash
set -e

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install PyTorch for ROCm (AMD)
echo "Installing PyTorch for ROCm..."
pip install torch==2.5.1+rocm6.2 torchaudio==2.5.1+rocm6.2 --extra-index-url https://download.pytorch.org/whl/rocm6.2

# Install F5-TTS dependencies
echo "Installing F5-TTS dependencies..."
if [ ! -d "F5-TTS" ]; then
    echo "Cloning F5-TTS repository..."
    git clone https://github.com/SWivid/F5-TTS.git
fi

cd F5-TTS
pip install -e .
cd ..

# Install additional dependencies for the API and transcription
echo "Installing API and other dependencies..."
pip install fastapi uvicorn python-multipart faster-whisper

echo "Setup complete. To start the server, run ./start.sh"
