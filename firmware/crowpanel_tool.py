#!/usr/bin/env python3
"""Probe and flash the CrowPanel through the direct CH340K USB transport.

SPDX-License-Identifier: GPL-2.0-or-later
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from ch340_usb import Ch340KSerial, probe as probe_bridge


def probe_chip() -> dict[str, object]:
    from esptool.cmds import detect_chip

    serial_port = Ch340KSerial()
    esp = None
    try:
        esp = detect_chip(
            serial_port,
            baud=115200,
            connect_mode="default_reset",
            connect_attempts=3,
        )
        return {
            "chip": esp.CHIP_NAME,
            "description": esp.get_chip_description(),
            "features": esp.get_chip_features(),
            "crystalMHz": esp.get_crystal_freq(),
        }
    finally:
        if esp is not None:
            esp.hard_reset()
        serial_port.close()


def flash(build_directory: Path) -> None:
    import esptool
    from esptool.cmds import detect_chip

    configured_boot_app0 = os.environ.get("ARDUINO_ESP32_BOOT_APP0")
    candidates = [] if configured_boot_app0 is None else [Path(configured_boot_app0)]
    candidates.extend(
        sorted(
            (
                Path.home()
                / "Library/Arduino15/packages/esp32/hardware/esp32"
            ).glob("*/tools/partitions/boot_app0.bin"),
            reverse=True,
        )
    )
    boot_app0 = next((path for path in candidates if path.is_file()), Path("missing-boot_app0.bin"))
    files = {
        "0x0": build_directory / "codex_usage_display.ino.bootloader.bin",
        "0x8000": build_directory / "codex_usage_display.ino.partitions.bin",
        "0xe000": boot_app0,
        "0x10000": build_directory / "codex_usage_display.ino.bin",
    }
    missing = [str(path) for path in files.values() if not path.is_file()]
    if missing:
        raise SystemExit(f"Missing compiled image(s): {', '.join(missing)}")

    serial_port = Ch340KSerial()
    esp = None
    completed = False
    try:
        esp = detect_chip(
            serial_port,
            baud=115200,
            connect_mode="default_reset",
            connect_attempts=3,
        )
        if esp.CHIP_NAME != "ESP32-S3":
            raise SystemExit(f"Refusing to flash unexpected chip {esp.CHIP_NAME}")
        esptool.main(
            [
                "--chip", "esp32s3",
                "--baud", "115200",
                "--before", "no_reset_no_sync",
                "--after", "hard_reset",
                "write_flash",
                "--flash_mode", "qio",
                "--flash_freq", "80m",
                "--flash_size", "8MB",
                *[item for pair in files.items() for item in (pair[0], str(pair[1]))],
            ],
            esp=esp,
        )
        completed = True
    finally:
        if esp is not None and not completed and serial_port.is_open:
            try:
                esp.hard_reset()
            except Exception:
                pass
        serial_port.close()


def send_snapshot(snapshot_path: str) -> dict[str, object]:
    raw_snapshot = (
        sys.stdin.read()
        if snapshot_path == "-"
        else Path(snapshot_path).read_text(encoding="utf-8")
    )
    snapshot = json.loads(raw_snapshot)
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("generatedAt"), int):
        raise SystemExit("Snapshot must be a display-message object with generatedAt")
    line = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"
    if len(line) > 2048:
        raise SystemExit("Snapshot exceeds the 2048-byte protocol limit")

    with Ch340KSerial() as serial_port:
        written = serial_port.write(line)
        response = bytearray()
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            byte = serial_port.read(1)
            if not byte:
                continue
            if byte == b"\n":
                try:
                    acknowledgement = json.loads(response)
                except json.JSONDecodeError:
                    response.clear()
                    continue
                if (
                    acknowledgement.get("schemaVersion") == 1
                    and acknowledgement.get("type") == "codex_usage_ack"
                    and acknowledgement.get("generatedAt") == snapshot["generatedAt"]
                    and acknowledgement.get("status") == "displayed"
                ):
                    return {
                        "status": "displayed",
                        "generatedAt": snapshot["generatedAt"],
                        "bytesWritten": written,
                    }
                response.clear()
            elif len(response) < 2048:
                response.extend(byte)
            else:
                response.clear()
        raise SystemExit("Timed out waiting for the display acknowledgement")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("probe-bridge")
    subparsers.add_parser("probe-chip")
    flash_parser = subparsers.add_parser("flash")
    flash_parser.add_argument("build_directory", type=Path)
    send_parser = subparsers.add_parser("send")
    send_parser.add_argument("snapshot", help="JSON snapshot path, or - for stdin")
    arguments = parser.parse_args()

    if arguments.command == "probe-bridge":
        print(json.dumps(probe_bridge(), indent=2, sort_keys=True))
    elif arguments.command == "probe-chip":
        print(json.dumps(probe_chip(), indent=2, sort_keys=True))
    elif arguments.command == "flash":
        flash(arguments.build_directory)
    else:
        print(json.dumps(send_snapshot(arguments.snapshot), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
