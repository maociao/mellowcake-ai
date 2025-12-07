#!/bin/bash

# Configuration
BACKUP_DIR="/home/mellowcake/backups"
SOURCE_DIR="/home/mellowcake/Code/mellowcake-ai"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_DAYS=7

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting backup..."

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
ASSETS=("uploads" "characters" "personas" "videos")
for asset in "${ASSETS[@]}"; do
    if [ -d "$SOURCE_DIR/public/$asset" ]; then
        mkdir -p "$TEMP_DIR/public/$asset"
        cp -r "$SOURCE_DIR/public/$asset"/* "$TEMP_DIR/public/$asset/"
        log "Backed up public/$asset"
    else
        log "WARNING: public/$asset directory not found."
    fi
done

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

log "Backup completed."
