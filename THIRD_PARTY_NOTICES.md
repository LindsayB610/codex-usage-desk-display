# Third-party notices

## Elecrow CrowPanel driver

The firmware depends on seven display-driver files from Elecrow's official
CrowPanel ESP32 2.13-inch repository at commit
`adf27048da2482b4ba4aa3514a6cd085ea4cb9b5b`. That repository did not include
a license when this project was prepared, so those files are not distributed
here. `firmware/prepare_firmware.py` downloads the pinned files from Elecrow and
applies this project's device-specific patch on the user's machine.

## Roboto Condensed Bold

`firmware/codex_usage_display/usage_font.h` contains generated bitmaps for the
digits and percent sign from Roboto Condensed Bold. Roboto is distributed under
the Apache License 2.0. See `LICENSE-APACHE-2.0.txt`.

## WCH CH341/CH340 transport behavior

`firmware/ch340_usb.py` implements the small serial subset needed by this
project. Its control-transfer sequence and constants follow WCH's official
GPL-licensed Linux driver: <https://github.com/WCHSoftGroup/ch341ser_linux>.
The transport module and the flashing tool that imports it are marked
`GPL-2.0-or-later`; see `LICENSE-GPL-2.0.txt`.
