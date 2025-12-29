#!/bin/bash

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"


# Configuration
BACKUP_DIR="/home/mellowcake/backups"
SOURCE_DIR="/home/mellowcake/Code/mellowcake-ai"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_DAYS=720

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting backup..."

# Cleanup orphaned files
if [ -f "$SOURCE_DIR/scripts/cleanup_orphans.js" ]; then
    log "Running cleanup of orphaned files..."
    node "$SOURCE_DIR/scripts/cleanup_orphans.js" >> "$LOG_FILE" 2>&1
    log "Cleanup finished."
else
    log "WARNING: Cleanup script not found."
fi

# Create a temporary directory for this backup
TEMP_DIR="$BACKUP_DIR/temp_$DATE"
mkdir -p "$TEMP_DIR"

# Backup Database
if [ -f "$SOURCE_DIR/mellowcake.db" ]; then
    cp "$SOURCE_DIR/mellowcake.db" "$TEMP_DIR/"
    log "Database backed up."
else
    log "ERROR: Database file not found!"
fi

# Backup Public Assets
ASSETS=("uploads" "characters" "personas" "videos" "audio-cache" "imagen-cache")
for asset in "${ASSETS[@]}"; do
    if [ -d "$SOURCE_DIR/public/$asset" ]; then
        mkdir -p "$TEMP_DIR/public/$asset"
        cp -r "$SOURCE_DIR/public/$asset"/* "$TEMP_DIR/public/$asset/"
        log "Backed up public/$asset"
    else
        log "WARNING: public/$asset directory not found."
    fi
done

# Backup Voices (Project Root)
if [ -d "$SOURCE_DIR/voices" ]; then
    # Helper to prevent 'cp' error if directory is empty but exists
    if [ -n "$(ls -A "$SOURCE_DIR/voices")" ]; then
        cp -r "$SOURCE_DIR/voices" "$TEMP_DIR/"
        log "Backed up voices directory."
    else
        mkdir -p "$TEMP_DIR/voices"
        log "Backed up empty voices directory."
    fi
else
    log "WARNING: voices directory not found."
fi

# Compress the backup
ARCHIVE_NAME="mellowcake_backup_$DATE.tar.gz"
tar -czf "$BACKUP_DIR/$ARCHIVE_NAME" -C "$TEMP_DIR" .
if [ $? -eq 0 ]; then
    log "Backup compressed successfully: $ARCHIVE_NAME"
else
    log "ERROR: Compression failed!"
fi

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# Delete old backups
find "$BACKUP_DIR" -name "mellowcake_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
log "Old backups cleaned up (retention: $RETENTION_DAYS days)."

# Cleanup temporary TTS files
if [ -d "$SOURCE_DIR/tts_service/uploads" ]; then
    rm -rf "$SOURCE_DIR/tts_service/uploads/"*
    log "Cleaned tts_service/uploads"
fi
if [ -d "$SOURCE_DIR/tts_service/outputs" ]; then
    rm -rf "$SOURCE_DIR/tts_service/outputs/"*
    log "Cleaned tts_service/outputs"
fi
if [ -d "$SOURCE_DIR/public/temp" ]; then
    rm -rf "$SOURCE_DIR/public/temp/"*
    log "Cleaned public/temp"
fi

log "Backup completed."
