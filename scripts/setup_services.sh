#!/bin/bash
set -e

# Detect User and Project Root
CURRENT_USER=$(whoami)
PROJECT_ROOT=$(pwd) # Assumes script is run from project root or handles absolute path if run from scripts/
# Ensure we are in the project root if the script is run from scripts/
if [[ $(basename "$PROJECT_ROOT") == "scripts" ]]; then
    cd ..
    PROJECT_ROOT=$(pwd)
fi

echo "Detected User: $CURRENT_USER"
echo "Detected Project Root: $PROJECT_ROOT"

# Auto-detect Node and Python
NODE_EXEC=$(which node)
NPM_EXEC=$(which npm)
NODE_BIN_DIR=$(dirname "$NODE_EXEC")

echo "Detected Node: $NODE_EXEC"
echo "Detected NPM: $NPM_EXEC"

# Default ComfyUI path (sibling directory)
DEFAULT_COMFY_ROOT="${PROJECT_ROOT}/../ComfyUI"
read -p "Enter ComfyUI absolute path (Default: $DEFAULT_COMFY_ROOT): " COMFYUI_ROOT
COMFYUI_ROOT=${COMFYUI_ROOT:-$DEFAULT_COMFY_ROOT}
echo "Using ComfyUI Root: $COMFYUI_ROOT"

# Detect Python for Comfy
PYTHON_EXEC="python3"
if [ -d "$COMFYUI_ROOT/venv" ]; then
    PYTHON_EXEC="$COMFYUI_ROOT/venv/bin/python3"
    echo "Detected ComfyUI venv Python: $PYTHON_EXEC"
else
    echo "Using system python3 for ComfyUI"
fi

# Function to generate service file from template
generate_service() {
    TEMPLATE_FILE="scripts/${1}.service.template"
    OUTPUT_FILE="scripts/${1}.service"
    
    echo "Generating $OUTPUT_FILE..."
    cp "$TEMPLATE_FILE" "$OUTPUT_FILE"
    
    # Replace placeholders
    sed -i "s|%USER%|$CURRENT_USER|g" "$OUTPUT_FILE"
    sed -i "s|%PROJECT_ROOT%|$PROJECT_ROOT|g" "$OUTPUT_FILE"
    sed -i "s|%NODE_EXEC%|$NODE_EXEC|g" "$OUTPUT_FILE"
    sed -i "s|%NPM_EXEC%|$NPM_EXEC|g" "$OUTPUT_FILE"
    sed -i "s|%NODE_BIN_DIR%|$NODE_BIN_DIR|g" "$OUTPUT_FILE"
    sed -i "s|%COMFYUI_ROOT%|$COMFYUI_ROOT|g" "$OUTPUT_FILE"
    sed -i "s|%PYTHON_EXEC%|$PYTHON_EXEC|g" "$OUTPUT_FILE"
}

# Generate files
generate_service "mellowcake-ai"
generate_service "comfyui"
generate_service "f5-tts"
generate_service "hindsight"

echo "Service files generated in scripts/ directory."
read -p "Do you want to install these services to systemd now? (y/N) " INSTALL_CHOICE

if [[ "$INSTALL_CHOICE" =~ ^[Yy]$ ]]; then
    echo "Installing systemd services..."
    sudo cp scripts/mellowcake-ai.service /etc/systemd/system/
    sudo cp scripts/comfyui.service /etc/systemd/system/
    sudo cp scripts/f5-tts.service /etc/systemd/system/
    sudo cp scripts/hindsight.service /etc/systemd/system/
    
    sudo systemctl daemon-reload
    sudo systemctl enable mellowcake-ai
    sudo systemctl enable comfyui
    sudo systemctl enable f5-tts
    sudo systemctl enable hindsight
    
    echo "Checking unattended-upgrades status..."
    sudo systemctl status unattended-upgrades --no-pager || true
    
    echo "Setup complete! Services installed and enabled."
else
    echo "Setup finished. Service files are generated but NOT installed."
fi
