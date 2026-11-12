import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db, sql } from "../db/client";
import { childDeviceBindings, devices } from "../db/schema";

const require = createRequire(import.meta.url);
const qrcode = require("qrcode-generator") as (typeNumber: number, errorCorrectionLevel: "H") => {
  addData(data: string): void;
  getModuleCount(): number;
  isDark(row: number, column: number): boolean;
  make(): void;
};
const { PNG } = require("pngjs") as typeof import("pngjs");
const {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} = require("@zxing/library") as typeof import("@zxing/library");

const OUTPUT_SIZE = 600;
const QR_VERSION = 4;
const QR_ERROR_CORRECTION: "H" = "H";
const QR_CELL_SIZE = 12;
const QR_MODULE_MARGIN = 5;
const CENTER_PLATE_SCALE = 0.12;
const CENTER_LOGO_SCALE = 0.03;
const QR_BORDER_INSET = 20;
const QR_BORDER_RADIUS = 40;
const QR_BORDER_WIDTH = 8;
const DARK = { r: 0x23, g: 0x1f, b: 0x20 };
const GOLD = { r: 0xf5, g: 0xcf, b: 0x8e };
const PINK = { r: 0xff, g: 0x66, b: 0xcb };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

const SEEDED_DEVICES = [
  { hardwareIdentifier: "SW-DEV-0001", status: "fresh" as const },
  { hardwareIdentifier: "SW-DEV-0002", status: "fresh" as const },
  { hardwareIdentifier: "SW-DEV-0003", status: "fresh" as const },
  { hardwareIdentifier: "SW-DEV-0004", status: "inactive" as const },
];

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const artifactsDir = path.join(rootDir, ".artifacts/device-qrs");
const brandMarkPath = path.join(rootDir, "apps/mobile/assets/images/brand-mark.png");
const brandMarkData = fs.readFileSync(brandMarkPath);
const brandMarkBase64 = brandMarkData.toString("base64");
const brandMarkDataUri = `data:image/png;base64,${brandMarkBase64}`;
const brandMarkPng = PNG.sync.read(brandMarkData);

function qrOffset(moduleCount: number) {
  const qrSize = (moduleCount + QR_MODULE_MARGIN * 2) * QR_CELL_SIZE;
  return {
    qrSize,
    offset: Math.floor((OUTPUT_SIZE - qrSize) / 2),
  };
}

function isFinderModule(moduleX: number, moduleY: number, moduleCount: number) {
  const finderOrigins = [
    { x: 0, y: 0 },
    { x: moduleCount - 7, y: 0 },
    { x: 0, y: moduleCount - 7 },
  ];

  for (const origin of finderOrigins) {
    if (
      moduleX >= origin.x &&
      moduleX < origin.x + 7 &&
      moduleY >= origin.y &&
      moduleY < origin.y + 7
    ) {
      return {
        localX: moduleX - origin.x,
        localY: moduleY - origin.y,
      };
    }
  }

  return null;
}

function moduleColor(moduleX: number, moduleY: number, moduleCount: number, isDarkModule: boolean) {
  if (!isDarkModule) {
    return WHITE;
  }

  const finder = isFinderModule(moduleX, moduleY, moduleCount);

  if (!finder) {
    return DARK;
  }

  const isOuterRing =
    finder.localX === 0 ||
    finder.localX === 6 ||
    finder.localY === 0 ||
    finder.localY === 6;

  return isOuterRing ? GOLD : DARK;
}

function buildQr(hardwareIdentifier: string) {
  const qr = qrcode(QR_VERSION, QR_ERROR_CORRECTION);
  qr.addData(hardwareIdentifier);
  qr.make();
  return qr;
}

function decodeQrPng(buffer: Buffer) {
  const parsed = PNG.sync.read(buffer);
  const pixels = new Int32Array(parsed.width * parsed.height);

  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    pixels[index] = (parsed.data[offset] << 16) | (parsed.data[offset + 1] << 8) | parsed.data[offset + 2];
  }

  const source = new RGBLuminanceSource(pixels, parsed.width, parsed.height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new QRCodeReader();

  try {
    return reader.decode(bitmap).getText();
  } catch {
    return null;
  }
}

function drawRoundedPlate(png: import("pngjs").PNG, x: number, y: number, size: number, radius: number) {
  for (let py = y; py < y + size; py += 1) {
    for (let px = x; px < x + size; px += 1) {
      const dx = Math.min(px - x, x + size - 1 - px);
      const dy = Math.min(py - y, y + size - 1 - py);
      const outsideRoundedCorner =
        dx < radius &&
        dy < radius &&
        ((dx - radius) ** 2 + (dy - radius) ** 2 > radius ** 2);

      if (outsideRoundedCorner) {
        continue;
      }

      const offset = (py * png.width + px) * 4;
      png.data[offset] = WHITE.r;
      png.data[offset + 1] = WHITE.g;
      png.data[offset + 2] = WHITE.b;
      png.data[offset + 3] = 255;
    }
  }
}

function overlayLogo(png: import("pngjs").PNG, x: number, y: number, size: number) {
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sourceX = Math.floor((px / size) * brandMarkPng.width);
      const sourceY = Math.floor((py / size) * brandMarkPng.height);
      const sourceOffset = (sourceY * brandMarkPng.width + sourceX) * 4;
      const alpha = (brandMarkPng.data[sourceOffset + 3] ?? 255) / 255;

      if (alpha <= 0) {
        continue;
      }

      const targetOffset = ((y + py) * png.width + (x + px)) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        png.data[targetOffset + channel] = Math.round(
          brandMarkPng.data[sourceOffset + channel] * alpha +
          png.data[targetOffset + channel] * (1 - alpha),
        );
      }

      png.data[targetOffset + 3] = 255;
    }
  }
}

function generateQrPng(hardwareIdentifier: string) {
  const qr = buildQr(hardwareIdentifier);
  const moduleCount = qr.getModuleCount();
  const { offset } = qrOffset(moduleCount);
  const png = new PNG({ width: OUTPUT_SIZE, height: OUTPUT_SIZE });

  for (let y = 0; y < OUTPUT_SIZE; y += 1) {
    for (let x = 0; x < OUTPUT_SIZE; x += 1) {
      let color = WHITE;
      const relativeX = x - offset;
      const relativeY = y - offset;
      const moduleX = Math.floor(relativeX / QR_CELL_SIZE) - QR_MODULE_MARGIN;
      const moduleY = Math.floor(relativeY / QR_CELL_SIZE) - QR_MODULE_MARGIN;

      if (
        relativeX >= 0 &&
        relativeY >= 0 &&
        moduleX >= 0 &&
        moduleY >= 0 &&
        moduleX < moduleCount &&
        moduleY < moduleCount
      ) {
        color = moduleColor(moduleX, moduleY, moduleCount, qr.isDark(moduleY, moduleX));
      }

      const pixelOffset = (y * OUTPUT_SIZE + x) * 4;
      png.data[pixelOffset] = color.r;
      png.data[pixelOffset + 1] = color.g;
      png.data[pixelOffset + 2] = color.b;
      png.data[pixelOffset + 3] = 255;
    }
  }

  const plateSize = Math.round(OUTPUT_SIZE * CENTER_PLATE_SCALE);
  const plateRadius = Math.round(plateSize * 0.18);
  const plateX = Math.floor((OUTPUT_SIZE - plateSize) / 2);
  const plateY = Math.floor((OUTPUT_SIZE - plateSize) / 2);
  drawRoundedPlate(png, plateX, plateY, plateSize, plateRadius);

  const logoSize = Math.round(OUTPUT_SIZE * CENTER_LOGO_SCALE);
  const logoX = Math.floor((OUTPUT_SIZE - logoSize) / 2);
  const logoY = Math.floor((OUTPUT_SIZE - logoSize) / 2);
  overlayLogo(png, logoX, logoY, logoSize);

  const output = PNG.sync.write(png);
  const decoded = decodeQrPng(output);

  if (decoded !== hardwareIdentifier) {
    throw new Error(`Generated PNG QR could not be decoded for ${hardwareIdentifier}.`);
  }

  return output;
}

function generateQrSvg(hardwareIdentifier: string) {
  const qr = buildQr(hardwareIdentifier);
  const moduleCount = qr.getModuleCount();
  const { offset, qrSize } = qrOffset(moduleCount);
  const borderGradientId = `brand-stroke-${hardwareIdentifier}`;
  const plateSize = Math.round(OUTPUT_SIZE * CENTER_PLATE_SCALE);
  const plateRadius = Math.round(plateSize * 0.18);
  const plateX = Math.floor((OUTPUT_SIZE - plateSize) / 2);
  const plateY = Math.floor((OUTPUT_SIZE - plateSize) / 2);
  const logoSize = Math.round(OUTPUT_SIZE * CENTER_LOGO_SCALE);
  const logoX = Math.floor((OUTPUT_SIZE - logoSize) / 2);
  const logoY = Math.floor((OUTPUT_SIZE - logoSize) / 2);

  const modules: string[] = [];

  for (let moduleY = 0; moduleY < moduleCount; moduleY += 1) {
    for (let moduleX = 0; moduleX < moduleCount; moduleX += 1) {
      if (!qr.isDark(moduleY, moduleX)) {
        continue;
      }

      const color = moduleColor(moduleX, moduleY, moduleCount, true);
      const x = offset + (moduleX + QR_MODULE_MARGIN) * QR_CELL_SIZE;
      const y = offset + (moduleY + QR_MODULE_MARGIN) * QR_CELL_SIZE;
      const fill = `rgb(${color.r},${color.g},${color.b})`;
      const radius = color === GOLD ? 3 : 2;
      modules.push(
        `<rect x="${x}" y="${y}" width="${QR_CELL_SIZE}" height="${QR_CELL_SIZE}" rx="${radius}" fill="${fill}" />`,
      );
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${OUTPUT_SIZE} ${OUTPUT_SIZE}" role="img" aria-label="QR code for ${hardwareIdentifier}">`,
    `<defs>`,
    `<linearGradient id="${borderGradientId}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="rgb(${GOLD.r},${GOLD.g},${GOLD.b})" />`,
    `<stop offset="100%" stop-color="rgb(${PINK.r},${PINK.g},${PINK.b})" />`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" fill="rgb(${WHITE.r},${WHITE.g},${WHITE.b})" />`,
    `<rect x="${QR_BORDER_INSET}" y="${QR_BORDER_INSET}" width="${OUTPUT_SIZE - QR_BORDER_INSET * 2}" height="${OUTPUT_SIZE - QR_BORDER_INSET * 2}" rx="${QR_BORDER_RADIUS}" fill="none" stroke="url(#${borderGradientId})" stroke-width="${QR_BORDER_WIDTH}" />`,
    `<rect x="${offset - 10}" y="${offset - 10}" width="${qrSize + 20}" height="${qrSize + 20}" rx="24" fill="rgb(${WHITE.r},${WHITE.g},${WHITE.b})" />`,
    ...modules,
    `<rect x="${plateX}" y="${plateY}" width="${plateSize}" height="${plateSize}" rx="${plateRadius}" fill="rgb(${WHITE.r},${WHITE.g},${WHITE.b})" />`,
    `<image href="${brandMarkDataUri}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />`,
    `</svg>`,
  ].join("");
}

async function upsertSeedDevice(input: typeof SEEDED_DEVICES[number]) {
  const [existing] = await db
    .select()
    .from(devices)
    .where(eq(devices.hardwareIdentifier, input.hardwareIdentifier))
    .limit(1);

  if (!existing) {
    await db.insert(devices).values({
      hardwareIdentifier: input.hardwareIdentifier,
      status: input.status,
      platform: "embedded",
      displayName: input.hardwareIdentifier,
    });

    return "inserted";
  }

  const [activeBinding] = await db
    .select({ id: childDeviceBindings.id })
    .from(childDeviceBindings)
    .where(and(eq(childDeviceBindings.deviceId, existing.id), isNull(childDeviceBindings.unboundAt)))
    .limit(1);

  const isReserved = Boolean(
    existing.reservationTokenHash &&
    existing.reservedUntil &&
    existing.reservedUntil > new Date(),
  );

  if (activeBinding || isReserved || existing.status === "active") {
    return "kept";
  }

  await db
    .update(devices)
    .set({
      displayName: existing.displayName ?? input.hardwareIdentifier,
      platform: existing.platform ?? "embedded",
      status: existing.status === "blocked" ? existing.status : input.status,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, existing.id));

  return existing.status === input.status ? "unchanged" : "updated";
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });

  try {
    for (const device of SEEDED_DEVICES) {
      const seeded = await upsertSeedDevice(device);
      const svg = generateQrSvg(device.hardwareIdentifier);
      const png = generateQrPng(device.hardwareIdentifier);

      fs.writeFileSync(path.join(artifactsDir, `${device.hardwareIdentifier}.svg`), svg);
      fs.writeFileSync(path.join(artifactsDir, `${device.hardwareIdentifier}.png`), png);

      console.info(`[seed-devices] ${device.hardwareIdentifier} -> ${seeded}, qr files updated`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
