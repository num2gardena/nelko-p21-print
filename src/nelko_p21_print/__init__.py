#!/usr/bin/env python3

"""Script to print images and manage settings on a Nelko P21 label printer via serial connection."""

import argparse
import csv
import os
import socket
import struct
import subprocess
import sys
from enum import IntEnum

import serial
from packaging.version import Version
from PIL import Image, ImageEnhance, ImageOps
from tqdm import tqdm

try:
    from .template import render_svg_template
except ImportError:
    from template import render_svg_template

DEBUG = False
SERIAL_DEVICE = "/dev/rfcomm0"


def crc16(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x1:  # If LSB is 1
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    # Convert the 16-bit integer to a 2-byte array in big-endian format.
    return crc.to_bytes(2, byteorder="big")


class DeviceConfig:
    def __init__(self, data):
        self.dpi_resolution = data[0]
        self.hardware_version = Version(f"{data[1]}.{data[2]}.{data[3]}")
        self.second_firmware_version = Version(f"{data[4]}.{data[5]}.{data[6]}")
        self.timeout_setting = TimeoutSetting(data[7])
        self.beep_setting = BeepSetting(data[8])

    def __str__(self):
        return (
            f"DPI Resolution: {self.dpi_resolution}\n"
            f"Hardware Version: {self.hardware_version}\n"
            f"Second Firmware Version: {self.second_firmware_version}\n"
            f"Timeout: {self.timeout_setting}\n"
            f"Beep: {self.beep_setting}"
        )


class PaperType(IntEnum):
    CONTINUOUS = 0
    GAPPED = 1
    BLACKMARK = 2

    def __str__(self):
        match self:
            case PaperType.GAPPED:
                return "Gapped"
            case PaperType.CONTINUOUS:
                return "Continuous"
            case PaperType.BLACKMARK:
                return "Blackmark"
            case _:
                return "Unknown"


class PrinterReadinessStatus(IntEnum):
    READY = 0
    LID_OPEN = 1
    OUT_OF_PAPER = 4
    BUSY = 32

    def __str__(self):
        match self:
            case PrinterReadinessStatus.READY:
                return "Ready"
            case PrinterReadinessStatus.LID_OPEN:
                return "Lid Open"
            case PrinterReadinessStatus.OUT_OF_PAPER:
                return "Paper not loaded"
            case PrinterReadinessStatus.BUSY:
                return "Busy"
            case _:
                return "Unknown"


class PaperColor(IntEnum):
    UNKNOWN = 0
    TRANSPARENT = 2
    WHITE = 3
    PINK = 4
    BLUE = 5
    YELLOW = 6

    def __str__(self):
        match self:
            case PaperColor.TRANSPARENT:
                return "Transparent"
            case PaperColor.WHITE:
                return "White"
            case PaperColor.PINK:
                return "Pink"
            case PaperColor.BLUE:
                return "Blue"
            case PaperColor.YELLOW:
                return "Yellow"
            case _:
                return "Unknown"


def validate_checksum(data):
    # The checksum is the last two bytes of the data.
    provided_checksum = data[-2:]
    # The checksum is computed over the data without the checksum itself.
    computed_checksum = crc16(data[:-2])
    if provided_checksum != computed_checksum:
        raise ValueError(
            f"Invalid checksum: {provided_checksum} != {computed_checksum}"
        )


def get_printer_status():
    status = send_command("\x1b!o\r\n")
    if not status:
        return None
    validate_checksum(status)
    return unpack_printer_status(status)


def unpack_printer_status(status):
    unpacked_status = struct.unpack(">BBBBBBBBBBBBBBBB", status)
    return PrinterStatus(unpacked_status)


class PrinterStatus:
    def __init__(self, data):
        self.printer_status = PrinterReadinessStatus(data[0])
        self.data_length = data[1]
        self.data_unknown = data[2]
        self.data_unknown2 = data[3]
        self.label_color = PaperColor(data[4])
        self.border_radius = data[6]  # Maybe padding?
        self.data_unknown3 = data[5]
        self.paper_type = PaperType(data[7])
        self.data_unknown4 = data[8]
        self.data_unknown5 = data[9]
        self.data_unknown6 = data[10]
        self.label_length = data[11]
        self.maximum_label_width = data[12]
        self.label_width = data[13]
        self.data_unknown7 = data[14]

    def __str__(self):
        print_status_str = f"{self.printer_status}\n"
        if self.label_width == 0 and self.label_length == 0:
            print_status_str += "The printer found no readable RFID tag."
        else:
            print_status_str += (
                f"Label Type: {self.label_width}x{self.label_length}mm"
                + f"({self.paper_type}), {self.label_color} color\n"
            )

        if DEBUG:
            print_status_str += (
                f"Data Length: {self.data_length}\n"
                + f"Border Radius ?: {self.border_radius}\n"
                + f"Maximum Label Width?: {self.maximum_label_width}\n"
                + f"Data Unknown 1 (byte 3): {hex(self.data_unknown)}\n"
                + f"Data Unknown 2 (byte 4): {hex(self.data_unknown2)}\n"
                + f"Data Unknown 3 (byte 5): {hex(self.data_unknown3)}\n"
                + f"Data Unknown 4 (byte 8): {hex(self.data_unknown4)}\n"
                + f"Data Unknown 5 (byte 9): {hex(self.data_unknown5)}\n"
                + f"Data Unknown 6 (byte 10): {hex(self.data_unknown6)}\n"
                + f"Data Unknown 7 (byte 15): {hex(self.data_unknown7)}\n"
            )
        return print_status_str


class BatteryData:
    def __init__(self, data):
        # The first byte contains the battery level as BCD (Binary Coded Decimal).
        # We need to convert it to a decimal number by combining the high and low nibbles.
        self.battery_level = ((data[0] >> 4) & 0x0F) * 10 + (data[0] & 0x0F)

        self.charging = data[1]

    def __str__(self):
        class ChargingString:
            def __init__(self, charging):
                self.charging = charging

            def __str__(self):
                match self.charging:
                    case True:
                        return "Charging"
                    case False:
                        return "Not Charging"
                    case _:
                        return "Unknown"

        # The printer always returns 99% charge when plugged.
        if self.charging:
            return (
                f"Battery Level: {self.battery_level}%\n"
                f"Charging: {ChargingString(self.charging)}\n"
                f"Unplug the printer to get a current battery reading."
            )
        else:
            return (
                f"Battery Level: {self.battery_level}%\n"
                f"Charging: {ChargingString(self.charging)}"
            )


class TimeoutSetting(IntEnum):
    NEVER = 0
    MINUTES_15 = 1
    MINUTES_30 = 2
    MINUTES_60 = 3

    def __str__(self):
        match self:
            case TimeoutSetting.NEVER:
                return "Never"
            case TimeoutSetting.MINUTES_15:
                return "15 minutes"
            case TimeoutSetting.MINUTES_30:
                return "30 minutes"
            case TimeoutSetting.MINUTES_60:
                return "60 minutes"
            case _:
                return "Unknown"


class BeepSetting(IntEnum):
    OFF = 0
    ON = 1

    def __str__(self):
        match self:
            case BeepSetting.ON:
                return "On"
            case BeepSetting.OFF:
                return "Off"
            case _:
                return "Unknown"


def load_image(image):
    # Load the image
    if isinstance(image, Image.Image):
        pass
    else:
        image = Image.open(image)
    image = ImageOps.grayscale(image)
    image = ImageOps.autocontrast(image)
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2)

    # Rotate the image to its longer side
    if image.width > image.height:
        image = image.rotate(90, expand=True)

    image.thumbnail((96, 284), Image.Resampling.NEAREST)
    image = image.convert("1", dither=Image.Dither.FLOYDSTEINBERG)

    # Convert the image to a bit array
    bitdata = image.tobytes()
    # Pad the image to 3408 bytes, so the printer doesn't fill the rest with black.
    if len(bitdata) < 3408:
        bitdata = bitdata.ljust(3408, b"\xff")

    return bitdata


def get_readiness_status():
    short_status = send_command("\x1b!?")
    if not short_status:
        return None
    unpacked_status = struct.unpack(">B", short_status)
    return PrinterReadinessStatus(unpacked_status[0])


def get_config():
    data = send_command("CONFIG?")
    if not data:
        return None
    configdata = clean_serial_response(data, "CONFIG ", 10)
    if not configdata:
        return None
    unpacked_data = struct.unpack(">hBBBBBBB?", configdata)
    return DeviceConfig(unpacked_data)


def get_battery():
    response = send_command("BATTERY?")
    if not response:
        return None
    configdata = clean_serial_response(response, "BATTERY ", 2)
    if not configdata:
        return None
    if DEBUG:
        print(f"Battery raw data: {configdata.hex()}")
    unpacked_data = struct.unpack(">B?", configdata)
    return BatteryData(unpacked_data)


def clean_serial_response(response, prefix, expected_len):
    if not response:
        return None
    # Cut off the prefix and the CRLF at the end.
    cleaned_response = response[len(prefix) : -2]
    # Validate the response
    if (
        not response.startswith(prefix.encode())
        or len(cleaned_response) != expected_len
    ):
        raise ValueError(f"Invalid response: {response.hex()}")
    return cleaned_response


def get_timeout_command(timeout):
    timeout_setting = TimeoutSetting.NEVER
    match timeout:
        case 0:
            timeout_setting = TimeoutSetting.NEVER
        case 15:
            timeout_setting = TimeoutSetting.MINUTES_15
        case 30:
            timeout_setting = TimeoutSetting.MINUTES_30
        case 60:
            timeout_setting = TimeoutSetting.MINUTES_60
        case _:
            print("Invalid timeout setting. Must be 0, 15, 30 or 60.")
            return

    return f"TIMEOUT {chr(timeout_setting.value)}"


def get_beep_command(beep):
    match beep:
        case True:
            beep_setting = BeepSetting.ON
        case False:
            beep_setting = BeepSetting.OFF
    return f"BEEP {chr(beep_setting.value)}"


def send_command(command, encode=True):
    global SERIAL_DEVICE
    
    cmd_str = command if isinstance(command, str) else command.decode(errors="ignore")
    
    # Define expected response lengths to avoid early termination on binary data (like 0x0a)
    if cmd_str.startswith("\x1b!?"):
        expected_len = 1
    elif cmd_str.startswith("\x1b!o"):
        expected_len = 16
    elif cmd_str.startswith("CONFIG?"):
        expected_len = 19
    elif cmd_str.startswith("BATTERY?"):
        expected_len = 12
    else:
        expected_len = None

    # Check if we should connect via native Bluetooth socket
    if isinstance(SERIAL_DEVICE, str) and SERIAL_DEVICE.count(":") == 5:
        if not hasattr(socket, "AF_BLUETOOTH"):
            print(
                "Error: Native Bluetooth sockets are not supported by this Python interpreter.\n"
                "Please run using system Python, e.g.:\n"
                "  uv run --python /usr/bin/python3 p21_print.py <args>",
                file=sys.stderr
            )
            sys.exit(1)
            
        try:
            s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
            s.settimeout(2.0)  # Use 2 seconds timeout to be safe
            s.connect((SERIAL_DEVICE, 1))
            
            payload = f"{command}\r\n".encode() if encode else command
            s.sendall(payload)
            
            if expected_len is not None:
                response = b""
                while len(response) < expected_len:
                    chunk = s.recv(expected_len - len(response))
                    if not chunk:
                        break
                    response += chunk
            else:
                # Read with a short timeout
                s.settimeout(0.5)
                response = b""
                try:
                    while True:
                        chunk = s.recv(1024)
                        if not chunk:
                            break
                        response += chunk
                except socket.timeout:
                    pass
                        
            if DEBUG:
                print(f"Received Bluetooth response: {response.hex()}")
            s.close()
            return response
        except Exception as e:
            print(f"Failed to send data via Bluetooth socket: {e}", file=sys.stderr)
            return b""
            
    try:
        with serial.Serial(SERIAL_DEVICE, 115200, timeout=1) as ser:
            if encode:
                ser.write(f"{command}\r\n".encode())
            else:
                ser.write(command)
                
            if expected_len is not None:
                response = b""
                while len(response) < expected_len:
                    chunk = ser.read(expected_len - len(response))
                    if not chunk:
                        break
                    response += chunk
            else:
                response = ser.readline()
                
            if DEBUG:
                print(f"Received response: {response.hex()}")
            return response
    except serial.SerialException as e:
        print(f"Failed to send data via serial connection: {e}")
        return


def build_print_command(imagedata, density, copies):
    serial_data = b"\x1b!o\r\n"
    serial_data += b"SIZE 14.0 mm,40.0 mm\r\n"
    serial_data += b"GAP 5.0 mm,0 mm\r\n"
    serial_data += b"DIRECTION 1,1\r\n"
    serial_data += f"DENSITY {density}\r\n".encode()
    serial_data += b"CLS\r\n"
    serial_data += b"BITMAP 0,0,12,284,1,"
    serial_data += imagedata
    serial_data += f"\r\nPRINT {copies}\r\n".encode()
    return serial_data


def find_paired_p21():
    """
    Search for paired Bluetooth devices using bluetoothctl to find a printer named P21.
    Returns its MAC address if found, otherwise None.
    """
    try:
        result = subprocess.run(["bluetoothctl", "devices"], capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if "P21" in line:
                    parts = line.split()
                    if len(parts) >= 3 and parts[0] == "Device":
                        mac = parts[1]
                        if mac.count(":") == 5:
                            return mac
    except Exception:
        pass
    return None

def p21_print(image, density, copies):
    bitdata = load_image(image)
    print_command = build_print_command(bitdata, density, copies)
    answer = send_command(print_command, encode=False)
    if answer:
        validate_checksum(answer)
        status = unpack_printer_status(answer)
        if status and (DEBUG or status.printer_status != PrinterReadinessStatus.READY):
            print(status)
    else:
        print("Failed to send print command. Make sure the printer is turned on and connected.")

def main():
    parser = argparse.ArgumentParser(
        description="Print an image on a Nelko P21 label printer."
    )
    parser.add_argument(
        "--device",
        help="The device to print to (defaults to /dev/rfcomm0)",
        default="/dev/rfcomm0",
    )
    parser.add_argument("--image", help="The image file to print.")
    parser.add_argument(
        "--density",
        help="The density/darkness of the print (1-15, defaults to 15)",
        type=int,
        default=15,
    )
    parser.add_argument(
        "--copies",
        help="The number of copies to print (defaults to 1)",
        type=int,
        default=1,
    )
    parser.add_argument(
        "--config", help="Get the printer configuration", action="store_true"
    )
    parser.add_argument("--status", help="Get the printer status", action="store_true")
    parser.add_argument(
        "--battery", help="Get the printer battery level", action="store_true"
    )
    parser.add_argument(
        "--timeout", help="Set the printer timeout in minutes (0, 15, 30, 60)", type=int
    )
    parser.add_argument(
        "--beep", help="Enable or disable the printer beep (True, False)", type=bool
    )
    parser.add_argument("--selftest", help="Run a self-test print", action="store_true")
    parser.add_argument("--debug", help="Enable debug output", action="store_true")
    parser.add_argument("--csv", help="Path to CSV file for batch/templated printing.")
    parser.add_argument("--template", help="Path to SVG layout template file.")
    parser.add_argument("--out-dir", help="Path to directory to save generated label images (optional).")
    parser.add_argument("--print", help="Send the rendered labels to the printer", action="store_true")

    try:
        args = parser.parse_args()
        if len(sys.argv) == 1:
            parser.print_help()
            return
    except (argparse.ArgumentError, argparse.ArgumentTypeError) as e:
        print(f"Failed to parse arguments: {e}")
        parser.print_help()
        return

    if args.device:
        global SERIAL_DEVICE
        SERIAL_DEVICE = args.device
        
        # Autodetect paired P21 Bluetooth MAC address if default serial port is missing
        if SERIAL_DEVICE == "/dev/rfcomm0" and not os.path.exists(SERIAL_DEVICE):
            mac = find_paired_p21()
            if mac:
                if args.debug or len(sys.argv) > 1:
                    print(f"Autodetected paired P21 printer at {mac}.")
                SERIAL_DEVICE = mac
                
    if args.debug:
        print("Debug mode enabled.")
        global DEBUG
        DEBUG = True
        print(f"Using serial device: {SERIAL_DEVICE}")
    if args.image:
        p21_print(args.image, args.density, args.copies)
    if args.config:
        config = get_config()
        if config:
            print("Printer configuration:")
            print(config)
        else:
            print("Failed to get printer configuration. Make sure the printer is turned on and connected.")
    if args.battery:
        battery = get_battery()
        if battery:
            print("Printer battery status:")
            print(battery)
        else:
            print("Failed to get printer battery status. Make sure the printer is turned on and connected.")
    if args.timeout:
        command = get_timeout_command(args.timeout)
        print(f"Setting timeout to {command} minutes.")
        send_command(command)
        config = get_config()
        if config:
            print(config)
    if args.beep:
        beep_command = get_beep_command(args.beep)
        send_command(beep_command)
        config = get_config()
        if config:
            print(config)
    if args.status:
        status = get_printer_status()
        if status:
            print(f"Printer status: {status}")
        else:
            print("Failed to get printer status. Make sure the printer is turned on and connected.")
    if args.selftest:
        print("Running self-test print:")
        send_command("SELFTEST")
        
    if args.csv and args.template:
        if not os.path.exists(args.csv):
            print(f"Error: CSV file not found: {args.csv}", file=sys.stderr)
            sys.exit(1)
        if not os.path.exists(args.template):
            print(f"Error: Template file not found: {args.template}", file=sys.stderr)
            sys.exit(1)
            
        with open(args.template, "r", encoding="utf-8") as f:
            template_content = f.read()
            
        with open(args.csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            
        if not rows:
            print("Warning: CSV file is empty or has no rows.")
            return
            
        print(f"Loaded {len(rows)} rows from CSV.")
        
        out_dir = args.out_dir
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        if args.print and out_dir:
            desc = "Printing + saving"
        elif args.print:
            desc = "Printing"
        elif out_dir:
            desc = "Saving"
        else:
            desc = "Rendering"

        for i, row in enumerate(tqdm(rows, desc=desc, unit="label")):
            try:
                rendered_img = render_svg_template(template_content, row)

                if out_dir:
                    out_path = os.path.join(out_dir, f"label_{i+1}.png")
                    rendered_img.save(out_path)

                if args.print:
                    p21_print(rendered_img, args.density, args.copies)
            except Exception as e:
                print(f"Failed to process label {i+1}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
