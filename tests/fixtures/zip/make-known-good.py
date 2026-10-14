#!/usr/bin/env python3
"""Writes the known-good archive that src/core/export/zip.ts must reproduce byte for byte (013 research R6,
contracts/files-and-storage.md "Known-good archive").

Run by hand, never in CI, and only when the contract's byte layout changes:

    python3 -I tests/fixtures/zip/make-known-good.py tests/fixtures/zip/known-good.zip
    unzip -t tests/fixtures/zip/known-good.zip

Python standard library only. The names and bodies are invented; tests/unit/core/export/zip.test.ts holds the same
inputs, so a change here is a change there.
"""
import sys
import zipfile

# 7 October 2026, 14:30:00, as local date and time fields (a zip stores no time zone).
DATE_TIME = (2026, 10, 7, 14, 30, 0)

ENTRIES = [
    (
        "Σύσκεψη — 07-10-2026 at 14h30 — Transcript.txt",
        "[00:04] Sarah Brown: Καλημέρα σε όλους, βλέπετε τη διαφάνεια με τον οδικό χάρτη;\n\n"
        "[00:11] Alex: Yes, it's up. The harbour survey moves to Thursday.\n",
    ),
    (
        "Σύσκεψη — 07-10-2026 at 14h30 — Meet captions.txt",
        "[00:04] Sarah Brown: Καλημέρα σε όλους, βλέπετε τη διαφάνεια;\n\n"
        "[00:11] Alex: Yes, it is up. The harbour survey moves to Thursday — agreed.\n",
    ),
]


def main(path: str) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
        for name, body in ENTRIES:
            info = zipfile.ZipInfo(filename=name, date_time=DATE_TIME)
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3  # Unix
            info.external_attr = 0o100644 << 16
            archive.writestr(info, body.encode("utf-8"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: make-known-good.py <output.zip>")
    main(sys.argv[1])
