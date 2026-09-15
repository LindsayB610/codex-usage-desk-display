#!/usr/bin/env python3
"""Minimal PySerial-compatible CH340K transport over libusb.

This avoids installing WCH's currently invalidly signed macOS system driver.
The control-transfer sequence and bit definitions follow WCH's official Linux
driver for USB VID:PID 1A86:7522:
https://github.com/WCHSoftGroup/ch341ser_linux

SPDX-License-Identifier: GPL-2.0-or-later
"""

from __future__ import annotations

import time
import os
from ctypes.util import find_library
from typing import Optional

import usb.backend.libusb1
import usb.core
import usb.util


VID = 0x1A86
PID = 0x7522

CMD_READ_REG = 0x95
CMD_WRITE_REG = 0x9A
CMD_SERIAL_INIT = 0xA1
CMD_MODEM_CTRL = 0xA4
CMD_VERSION = 0x5F

CTRL_DTR = 0x20
CTRL_RTS = 0x40

class Ch340UsbError(RuntimeError):
    pass


def _backend():
    configured = os.environ.get("LIBUSB_PATH")
    candidates = [
        configured,
        find_library("usb-1.0"),
        "/opt/homebrew/lib/libusb-1.0.dylib",
        "/usr/local/lib/libusb-1.0.dylib",
    ]
    library = next((candidate for candidate in candidates if candidate), None)
    backend = usb.backend.libusb1.get_backend(
        find_library=(lambda _name: library) if library else None
    )
    if backend is None:
        raise Ch340UsbError("libusb was not found; install it or set LIBUSB_PATH")
    return backend


class Ch340KSerial:
    """The serial subset used by esptool 4.5.1 and the display host service."""

    def __init__(self, baudrate: int = 115200, timeout: float = 0.1):
        self.port = "rfc2217:wchusb-direct"
        self.name = self.port
        self.timeout = timeout
        self.write_timeout: Optional[float] = 10
        self._baudrate = 9600
        self._dtr = False
        self._rts = False
        self._closed = False
        self._read_buffer = bytearray()

        devices = list(
            usb.core.find(
                find_all=True,
                backend=_backend(),
                idVendor=VID,
                idProduct=PID,
            )
        )
        if len(devices) != 1:
            raise Ch340UsbError(
                f"Expected exactly one CH340K {VID:04x}:{PID:04x}; found {len(devices)}"
            )
        self.device = devices[0]
        try:
            configuration = self.device.get_active_configuration()
        except usb.core.USBError as error:
            if "Configuration not set" not in str(error):
                raise
            self.device.set_configuration()
            configuration = self.device.get_active_configuration()
        self.interface = configuration[(0, 0)]
        usb.util.claim_interface(self.device, self.interface.bInterfaceNumber)

        self.endpoint_in = next(
            endpoint
            for endpoint in self.interface
            if usb.util.endpoint_direction(endpoint.bEndpointAddress)
            == usb.util.ENDPOINT_IN
            and usb.util.endpoint_type(endpoint.bmAttributes)
            == usb.util.ENDPOINT_TYPE_BULK
        )
        self.endpoint_out = next(
            endpoint
            for endpoint in self.interface
            if usb.util.endpoint_direction(endpoint.bEndpointAddress)
            == usb.util.ENDPOINT_OUT
            and usb.util.endpoint_type(endpoint.bmAttributes)
            == usb.util.ENDPOINT_TYPE_BULK
        )

        self._configure_bridge()
        self.baudrate = baudrate
        self.setDTR(False)
        self.setRTS(False)

    def _control_out(self, request: int, value: int, index: int) -> None:
        transferred = self.device.ctrl_transfer(
            0x40, request, value, index, None, timeout=2000
        )
        if transferred != 0:
            raise Ch340UsbError(
                f"Unexpected control transfer length {transferred} for request {request:#x}"
            )

    def _control_in(self, request: int, value: int, index: int, length: int = 2) -> bytes:
        return bytes(
            self.device.ctrl_transfer(
                0xC0, request, value, index, length, timeout=2000
            )
        )

    def _configure_bridge(self) -> None:
        self.version = self._control_in(CMD_VERSION, 0, 0)
        self._control_out(CMD_SERIAL_INIT, 0, 0)
        self._control_out(CMD_WRITE_REG, 0x1312, 0xD982)
        self._control_out(CMD_WRITE_REG, 0x0F2C, 0x0007)
        self.serial_registers = self._control_in(CMD_READ_REG, 0x2518, 0)
        self.modem_status = self._control_in(CMD_READ_REG, 0x0706, 0)
        self._control_out(CMD_WRITE_REG, 0x2727, 0x0000)

    @staticmethod
    def _baud_factor(baudrate: int) -> tuple[int, int]:
        if baudrate == 921600:
            return 0xF3, 7
        if baudrate == 307200:
            return 0xD9, 7
        if baudrate <= 0:
            raise Ch340UsbError(f"Invalid baud rate {baudrate}")
        if baudrate > 6_000_000 // 255:
            divisor, clock = 3, 6_000_000
        elif baudrate > 750_000 // 255:
            divisor, clock = 2, 750_000
        elif baudrate > 93_750 // 255:
            divisor, clock = 1, 93_750
        else:
            divisor, clock = 0, 11_719
        factor = clock // baudrate
        if factor in (0, 0xFF):
            raise Ch340UsbError(f"Unsupported baud rate {baudrate}")
        if clock // factor - baudrate > baudrate - clock // (factor + 1):
            factor += 1
        return 256 - factor, divisor

    @property
    def baudrate(self) -> int:
        return self._baudrate

    @baudrate.setter
    def baudrate(self, value: int) -> None:
        factor, divisor = self._baud_factor(value)
        # 8 data bits, no parity, one stop bit, receiver/transmitter enabled.
        line_control = 0xC3
        register_count = 0x9C
        request_value = register_count | (line_control << 8)
        request_index = 0x80 | divisor | (factor << 8)
        self._control_out(CMD_SERIAL_INIT, request_value, request_index)
        receive_timeout = max(0x07, 76_800 // value)
        self._control_out(CMD_WRITE_REG, 0x0F2C, receive_timeout)
        self._control_out(CMD_WRITE_REG, 0x2727, 0x0000)
        self._baudrate = value

    def _apply_modem_control(self) -> None:
        asserted = (CTRL_DTR if self._dtr else 0) | (CTRL_RTS if self._rts else 0)
        self._control_out(CMD_MODEM_CTRL, (~asserted) & 0xFF, 0)

    @property
    def dtr(self) -> bool:
        return self._dtr

    @dtr.setter
    def dtr(self, state: bool) -> None:
        self.setDTR(state)

    @property
    def rts(self) -> bool:
        return self._rts

    @rts.setter
    def rts(self, state: bool) -> None:
        self.setRTS(state)

    def setDTR(self, state: bool) -> None:
        self._dtr = bool(state)
        self._apply_modem_control()

    def setRTS(self, state: bool) -> None:
        self._rts = bool(state)
        self._apply_modem_control()

    def write(self, data: bytes) -> int:
        if self._closed:
            raise Ch340UsbError("Serial bridge is closed")
        timeout_ms = 0 if self.write_timeout is None else max(1, int(self.write_timeout * 1000))
        return int(self.endpoint_out.write(data, timeout=timeout_ms))

    def _read_once(self, size: int, timeout: Optional[float] = None) -> bytes:
        timeout_seconds = self.timeout if timeout is None else timeout
        timeout_ms = max(1, int((timeout_seconds or 0.001) * 1000))
        try:
            return bytes(self.endpoint_in.read(max(1, size), timeout=timeout_ms))
        except usb.core.USBTimeoutError:
            return b""

    def read(self, size: int = 1) -> bytes:
        deadline = time.monotonic() + (self.timeout or 0)
        while len(self._read_buffer) < size:
            remaining = max(0.001, deadline - time.monotonic())
            chunk = self._read_once(
                max(size - len(self._read_buffer), self.endpoint_in.wMaxPacketSize),
                remaining,
            )
            if chunk:
                self._read_buffer.extend(chunk)
            if not chunk or time.monotonic() >= deadline:
                break
        output = bytes(self._read_buffer[:size])
        del self._read_buffer[:size]
        return output

    @property
    def in_waiting(self) -> int:
        return len(self._read_buffer)

    def inWaiting(self) -> int:
        return self.in_waiting

    def reset_input_buffer(self) -> None:
        self._read_buffer.clear()
        while self._read_once(self.endpoint_in.wMaxPacketSize, 0.005):
            pass

    def flushInput(self) -> None:
        self.reset_input_buffer()

    def reset_output_buffer(self) -> None:
        return None

    def flushOutput(self) -> None:
        self.reset_output_buffer()

    def flush(self) -> None:
        return None

    def close(self) -> None:
        if self._closed:
            return
        try:
            self.setDTR(False)
            self.setRTS(False)
        finally:
            usb.util.release_interface(self.device, self.interface.bInterfaceNumber)
            usb.util.dispose_resources(self.device)
            self._closed = True

    @property
    def is_open(self) -> bool:
        return not self._closed

    def __enter__(self) -> "Ch340KSerial":
        return self

    def __exit__(self, _type, _value, _traceback) -> None:
        self.close()


def probe() -> dict[str, object]:
    with Ch340KSerial() as serial_port:
        return {
            "vid": f"{serial_port.device.idVendor:04x}",
            "pid": f"{serial_port.device.idProduct:04x}",
            "interface": serial_port.interface.bInterfaceNumber,
            "bulkIn": f"0x{serial_port.endpoint_in.bEndpointAddress:02x}",
            "bulkOut": f"0x{serial_port.endpoint_out.bEndpointAddress:02x}",
            "baudrate": serial_port.baudrate,
            "versionReply": serial_port.version.hex(),
            "serialRegisters": serial_port.serial_registers.hex(),
            "modemStatus": serial_port.modem_status.hex(),
        }


if __name__ == "__main__":
    import json

    print(json.dumps(probe(), indent=2, sort_keys=True))
