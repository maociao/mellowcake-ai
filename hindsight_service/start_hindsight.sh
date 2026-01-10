#!/bin/bash

# Configuration
export PORT=8888

# Source .env.local from project root if it exists
if [ -f "$(dirname "$0")/../.env.local" ]; then
    set -a
    source "$(dirname "$0")/../.env.local"
    set +a
fi
export HINDSIGHT_API_LLM_PROVIDER=${HINDSIGHT_API_LLM_PROVIDER:-ollama}
export HINDSIGHT_API_LLM_API_KEY=ollama
export HINDSIGHT_API_LLM_MODEL=${HINDSIGHT_API_LLM_MODEL:-fluffy/l3-8b-stheno-v3.2}
export HINDSIGHT_API_LLM_BASE_URL=${HINDSIGHT_API_LLM_BASE_URL:-http://localhost:11434/v1}
export HINDSIGHT_API_LOG_LEVEL=${HINDSIGHT_API_LOG_LEVEL:-info}

# Ensure we are in the correct directory
cd "$(dirname "$0")/hindsight-api"

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Please run installation first."
    exit 1
fi

# Activate venv
source venv/bin/activate

# Start the server
echo "Starting Hindsight API on port $PORT..."
echo "Provider: $HINDSIGHT_API_LLM_PROVIDER"
echo "Model: $HINDSIGHT_API_LLM_MODEL"

# Run module directly (main() calls uvicorn.run)
exec ./venv/bin/python -m hindsight_api.main --port $PORT --host 0.0.0.0
