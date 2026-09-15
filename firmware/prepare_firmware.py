#!/usr/bin/env python3
"""Fetch pinned Elecrow driver files and apply the local display patch."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path


COMMIT = "adf27048da2482b4ba4aa3514a6cd085ea4cb9b5b"
BASE_URL = (
    "https://raw.githubusercontent.com/Elecrow-RD/"
    "CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/"
    f"{COMMIT}/example/arduino-v1.2/main"
)
UPSTREAM_HASHES = {
    "EPD.cpp": "a233eff60a0570e48e1fe24c6ba0839ec45ea2782f4ed051dc6ad4c9c0b99a39",
    "EPD.h": "69b05dd141a9f4509a01769b9313ee6fb8e276e6a7f6e15f2790ac98d1dea3f3",
    "EPD_Init.cpp": "164667f9f1313fc7288d43ffec84fb2e8eaeb02689b2927c201669e17c4517da",
    "EPD_Init.h": "e59234513274e352d942b73db36b5e33856ada6f1bda6ee4d14a30899e61b4e4",
    "EPDfont.h": "4c3cd471e9d264731086a38c3cf889af9b1bc9b988f41a9a99f28d181e828beb",
    "spi.cpp": "dd91fb4e5330c76f58865a50d61d236bda5422e78277363b83d162f4068199d8",
    "spi.h": "d1250708b544e2c960d4f5aa66b96becd879fe9f39ccbd1c37821b3a2212b648",
}
PREPARED_HASHES = {
    **UPSTREAM_HASHES,
    "EPD_Init.cpp": "5d26c4e9c16af534abeb60f95c882e765599ece69b0a05b428edd8c8fc56c555",
    "EPD_Init.h": "5186fb50fd70d40aca3d3f88d31b7757b768b856970a87469f6a02706a139498",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_source(name: str, source_dir: Path | None) -> bytes:
    if source_dir is not None:
        return (source_dir / name).read_bytes()
    with urllib.request.urlopen(f"{BASE_URL}/{name}", timeout=30) as response:
        return response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Use an existing Elecrow arduino-v1.2/main directory instead of downloading",
    )
    parser.add_argument("--force", action="store_true", help="Replace existing prepared driver files")
    args = parser.parse_args()

    firmware_dir = Path(__file__).resolve().parent
    sketch_dir = firmware_dir / "codex_usage_display"
    patch_path = firmware_dir / "patches" / "elecrow-v1.2.patch"
    sketch_dir.mkdir(parents=True, exist_ok=True)

    current = {
        name: digest((sketch_dir / name).read_bytes())
        for name in UPSTREAM_HASHES
        if (sketch_dir / name).is_file()
    }
    if current == PREPARED_HASHES:
        print(json.dumps({"status": "already-prepared", "commit": COMMIT}))
        return
    if current and not args.force:
        raise SystemExit("Driver files already exist but do not match the prepared set; use --force to replace them")

    for name, expected_hash in UPSTREAM_HASHES.items():
        data = read_source(name, args.source_dir)
        actual_hash = digest(data)
        if actual_hash != expected_hash:
            raise SystemExit(f"Hash mismatch for {name}: expected {expected_hash}, got {actual_hash}")
        (sketch_dir / name).write_bytes(data)

    subprocess.run(
        ["patch", "-p1", "--batch", "--forward", "-i", str(patch_path)],
        cwd=sketch_dir,
        check=True,
    )
    for name, expected_hash in PREPARED_HASHES.items():
        actual_hash = digest((sketch_dir / name).read_bytes())
        if actual_hash != expected_hash:
            raise SystemExit(f"Prepared hash mismatch for {name}: expected {expected_hash}, got {actual_hash}")
    print(json.dumps({"status": "prepared", "commit": COMMIT}))


if __name__ == "__main__":
    main()
