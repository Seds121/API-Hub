#!/usr/bin/env bash
# PostgreSQL backup: compressed custom-format dump, optional client-side encryption, retention pruning.
# Usage: DATABASE_URL=... BACKUP_DIR=/backups [BACKUP_GPG_RECIPIENT=ops@company] [RETENTION_DAYS=30] ./backup.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$BACKUP_DIR/zeze-$STAMP.dump"
pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" --file="$FILE"
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$FILE" && shred -u "$FILE" && FILE="$FILE.gpg"
fi
sha256sum "$FILE" > "$FILE.sha256"
find "$BACKUP_DIR" -name 'zeze-*' -mtime +"$RETENTION_DAYS" -delete
echo "backup written: $FILE"
# Restore: pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" zeze-<stamp>.dump
