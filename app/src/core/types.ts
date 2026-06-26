/**
 * Enums and parsed data structures for the Nelko P21 protocol.
 * Ported from the IntEnum classes in src/nelko_p21_print/__init__.py.
 */

export const PaperType = {
  CONTINUOUS: 0,
  GAPPED: 1,
  BLACKMARK: 2,
} as const;
export type PaperType = (typeof PaperType)[keyof typeof PaperType];

export function paperTypeLabel(t: PaperType): string {
  switch (t) {
    case PaperType.GAPPED:
      return 'Gapped';
    case PaperType.CONTINUOUS:
      return 'Continuous';
    case PaperType.BLACKMARK:
      return 'Blackmark';
    default:
      return 'Unknown';
  }
}

export const PrinterReadinessStatus = {
  READY: 0,
  LID_OPEN: 1,
  OUT_OF_PAPER: 4,
  BUSY: 32,
} as const;
export type PrinterReadinessStatus =
  (typeof PrinterReadinessStatus)[keyof typeof PrinterReadinessStatus];

export function readinessLabel(s: PrinterReadinessStatus): string {
  switch (s) {
    case PrinterReadinessStatus.READY:
      return 'Ready';
    case PrinterReadinessStatus.LID_OPEN:
      return 'Lid Open';
    case PrinterReadinessStatus.OUT_OF_PAPER:
      return 'Paper not loaded';
    case PrinterReadinessStatus.BUSY:
      return 'Busy';
    default:
      return 'Unknown';
  }
}

export const PaperColor = {
  UNKNOWN: 0,
  TRANSPARENT: 2,
  WHITE: 3,
  PINK: 4,
  BLUE: 5,
  YELLOW: 6,
} as const;
export type PaperColor = (typeof PaperColor)[keyof typeof PaperColor];

export function paperColorLabel(c: PaperColor): string {
  switch (c) {
    case PaperColor.TRANSPARENT:
      return 'Transparent';
    case PaperColor.WHITE:
      return 'White';
    case PaperColor.PINK:
      return 'Pink';
    case PaperColor.BLUE:
      return 'Blue';
    case PaperColor.YELLOW:
      return 'Yellow';
    default:
      return 'Unknown';
  }
}

export const TimeoutSetting = {
  NEVER: 0,
  MINUTES_15: 1,
  MINUTES_30: 2,
  MINUTES_60: 3,
} as const;
export type TimeoutSetting =
  (typeof TimeoutSetting)[keyof typeof TimeoutSetting];

export const BeepSetting = {
  OFF: 0,
  ON: 1,
} as const;
export type BeepSetting = (typeof BeepSetting)[keyof typeof BeepSetting];

/** Parsed `CONFIG?` response. */
export interface DeviceConfig {
  dpiResolution: number;
  hardwareVersion: string;
  secondFirmwareVersion: string;
  timeout: TimeoutSetting;
  beep: BeepSetting;
}

/** Parsed `\x1b!o` (ESC !o) 16-byte status response. */
export interface PrinterStatus {
  readiness: PrinterReadinessStatus;
  labelColor: PaperColor;
  paperType: PaperType;
  /** Label dimensions in mm as read from the roll's RFID tag (0 if no tag). */
  labelWidthMm: number;
  labelLengthMm: number;
  maximumLabelWidthMm: number;
  borderRadius: number;
  /** True when no readable RFID tag was found (width and length both 0). */
  noRfidTag: boolean;
}

/** Parsed `BATTERY?` response. */
export interface BatteryData {
  /** Charge level in percent (decoded from BCD). */
  level: number;
  charging: boolean;
}
