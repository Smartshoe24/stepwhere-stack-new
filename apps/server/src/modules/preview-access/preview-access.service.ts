import { desc, eq } from "drizzle-orm";
import type {
  CreatePreviewAccessEntryInput,
  PreviewAccessEntryDto,
  PreviewAccessStateDto,
  UpdatePreviewAccessEntryInput,
} from "@stepwhere/types";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { previewAccessEntries } from "../../db/schema";
import { normalizePhoneNumber } from "../auth/phone-number";
import { AppError, conflict, notFound } from "../../shared/errors";

type PreviewAccessEntryRecord = typeof previewAccessEntries.$inferSelect;

function toDto(entry: PreviewAccessEntryRecord): PreviewAccessEntryDto {
  return {
    id: entry.id,
    phoneNumber: entry.phoneNumber,
    label: entry.label,
    isActive: entry.isActive,
    createdByUserId: entry.createdByUserId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function normalizeLabel(label: string | null | undefined) {
  if (label === undefined) {
    return undefined;
  }

  const normalized = label?.trim() ?? "";
  return normalized || null;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && error.code === "23505",
  );
}

export function isPreviewModeEnabled() {
  return env.PREVIEW_MODE_ENABLED;
}

export async function isPhonePreviewAllowed(phoneNumber: string) {
  if (!isPreviewModeEnabled()) {
    return true;
  }

  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const [entry] = await db
    .select({ isActive: previewAccessEntries.isActive })
    .from(previewAccessEntries)
    .where(eq(previewAccessEntries.phoneNumber, normalizedPhoneNumber))
    .limit(1);

  return entry?.isActive === true;
}

export async function assertPhonePreviewAccess(phoneNumber: string) {
  if (await isPhonePreviewAllowed(phoneNumber)) {
    return;
  }

  throw new AppError(
    403,
    "PREVIEW_ACCESS_REQUIRED",
    "Stepwhere is currently available to invited preview testers.",
  );
}

export async function listPreviewAccess(): Promise<PreviewAccessStateDto> {
  const entries = await db
    .select()
    .from(previewAccessEntries)
    .orderBy(desc(previewAccessEntries.isActive), desc(previewAccessEntries.createdAt));

  return {
    enabled: isPreviewModeEnabled(),
    entries: entries.map(toDto),
  };
}

export async function createPreviewAccessEntry(
  input: CreatePreviewAccessEntryInput,
  createdByUserId: string,
) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);

  try {
    const [entry] = await db
      .insert(previewAccessEntries)
      .values({
        phoneNumber,
        label: normalizeLabel(input.label) ?? null,
        createdByUserId,
      })
      .returning();

    return toDto(entry);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("This phone number is already on the preview list.");
    }

    throw error;
  }
}

export async function updatePreviewAccessEntry(
  entryId: string,
  input: UpdatePreviewAccessEntryInput,
) {
  const [entry] = await db
    .update(previewAccessEntries)
    .set({
      label: normalizeLabel(input.label),
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(previewAccessEntries.id, entryId))
    .returning();

  if (!entry) {
    throw notFound("NOT_FOUND", "Preview access entry not found.");
  }

  return toDto(entry);
}

export async function deletePreviewAccessEntry(entryId: string) {
  const [entry] = await db
    .delete(previewAccessEntries)
    .where(eq(previewAccessEntries.id, entryId))
    .returning();

  if (!entry) {
    throw notFound("NOT_FOUND", "Preview access entry not found.");
  }

  return toDto(entry);
}
