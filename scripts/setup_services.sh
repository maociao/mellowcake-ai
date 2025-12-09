#!/bin/bash

echo "Installing systemd services..."
sudo cp scripts/mellowcake-ai.service /etc/systemd/system/
sudo cp scripts/comfyui.service /etc/systemd/system/
sudo cp scripts/f5-tts.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mellowcake-ai
sudo systemctl enable comfyui
sudo systemctl enable f5-tts

echo "Checking unattended-upgrades status..."
sudo systemctl status unattended-upgrades --no-pager

echo "Setup complete!"
