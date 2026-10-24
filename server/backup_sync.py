"""Consistent SQLite backup outside the public web root. Called by root's timer."""
import datetime
import os
import sqlite3
from pathlib import Path

os.umask(0o077)
root = Path('/var/backups/listening-sync')
root.mkdir(parents=True, exist_ok=True)
target = root / ('progress-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S') + '.sqlite')
source = sqlite3.connect('file:/var/lib/listening-sync/progress.sqlite?mode=ro', uri=True)
destination = sqlite3.connect(target)
try:
    source.backup(destination)
finally:
    destination.close()
    source.close()
