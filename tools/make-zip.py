#!/usr/bin/env python3
"""Builds AllowPaste.zip, the ready-to-install extension, from the extension/ folder.

    python3 tools/make-zip.py           # rebuild AllowPaste.zip
    python3 tools/make-zip.py --check   # fail if AllowPaste.zip doesn't match extension/

The zip holds one folder, AllowPaste/, with the extension's files: unzip it and
choose that folder in chrome://extensions -> Load unpacked.
Run this after every change to extension/ (tests/run.cjs checks it).
"""
import io
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "extension"
ZIP = ROOT / "AllowPaste.zip"
FOLDER = "AllowPaste/"


def wanted_files():
    """name in the zip -> file contents, for every file in extension/ (hidden files skipped)."""
    files = {}
    for path in sorted(SOURCE.rglob("*")):
        rel = path.relative_to(SOURCE)
        if path.is_file() and not any(part.startswith(".") for part in rel.parts):
            files[FOLDER + rel.as_posix()] = path.read_bytes()
    return files


def build(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            # Fixed date and permissions, so rebuilding unchanged files gives the same zip.
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
    return buf.getvalue()


def main():
    files = wanted_files()
    if "--check" in sys.argv[1:]:
        try:
            with zipfile.ZipFile(ZIP) as z:
                current = {name: z.read(name) for name in z.namelist()}
        except (FileNotFoundError, zipfile.BadZipFile):
            current = None
        if current == files:
            print("AllowPaste.zip matches extension/")
            return 0
        print("AllowPaste.zip doesn't match extension/ - run: python3 tools/make-zip.py")
        return 1
    ZIP.write_bytes(build(files))
    print(f"Wrote {ZIP.name} ({len(files)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
