#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB_URI:?Set MONGODB_URI on a protected backup host}"
: "${BACKUP_DIR:?Set a protected backup directory}"
umask 077
mkdir -p "$BACKUP_DIR"
archive=$(mktemp "$BACKUP_DIR/village360-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
trap 'rm -f "$archive"' ERR
# Pipe a tools configuration through stdin to keep the URI out of process arguments.
python3 -c 'import json,os;print(json.dumps({"uri":os.environ["MONGODB_URI"]}))' |
  mongodump --config=/dev/stdin --db=village360 --excludeCollection=sessions --gzip --archive="$archive"
mv "$archive" "$archive.archive.gz"
