import { randomUUID } from "node:crypto";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3ServiceException,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CreateChildAvatarUploadIntentInput,
  CreateChildAvatarUploadIntentResponseDto,
  CreateUserAvatarUploadIntentInput,
  CreateUserAvatarUploadIntentResponseDto,
} from "@stepwhere/types";

import { getS3Client, storageBucket } from "../../infrastructure/s3";
import { badRequest, conflict } from "../../shared/errors";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_SIGNED_URL_SECONDS = 60 * 10;
const AVATAR_UPLOAD_URL_SECONDS = 60 * 10;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Avatars share the storage bucket with other app files, so their objects live
 * under this key prefix. The prefix is a server-side detail: clients, the
 * database and ownership checks all use the logical avatar path
 * (`<org>/<user>/<file>` or `users/<user>/<file>`). Only the S3 calls below
 * add or strip it.
 */
const AVATAR_KEY_PREFIX = "avatars/";

export function toAvatarObjectKey(path: string) {
  return `${AVATAR_KEY_PREFIX}${path}`;
}

export function fromAvatarObjectKey(key: string) {
  return key.startsWith(AVATAR_KEY_PREFIX)
    ? key.slice(AVATAR_KEY_PREFIX.length)
    : null;
}

function extensionForMimeType(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function isStoredAvatarPath(value: string | null | undefined) {
  return Boolean(value && !/^https?:\/\//i.test(value));
}

export function assertChildAvatarOwnership(input: {
  organizationId: string;
  userId: string;
  path: string;
}) {
  const expectedPrefix = `${input.organizationId}/${input.userId}/`;

  if (!input.path.startsWith(expectedPrefix)) {
    throw conflict("Avatar upload does not belong to this user.");
  }
}

export function assertUserAvatarOwnership(input: {
  userId: string;
  path: string;
}) {
  const expectedPrefix = `users/${input.userId}/`;

  if (!input.path.startsWith(expectedPrefix)) {
    throw conflict("Avatar upload does not belong to this user.");
  }
}

function validateAvatarFile(file: {
  contentType: string;
  fileSize: number;
}, label: string) {
  const contentType = file.contentType.trim().toLowerCase();

  if (!ALLOWED_AVATAR_MIME_TYPES.has(contentType)) {
    throw badRequest("Only JPEG, PNG and WebP images are supported.");
  }

  if (file.fileSize <= 0 || file.fileSize > MAX_AVATAR_BYTES) {
    throw badRequest(`${label} must be 5 MB or smaller.`);
  }

  const extension = extensionForMimeType(contentType);

  if (!extension) {
    throw badRequest("Unsupported image type.");
  }

  return {
    contentType,
    extension,
  };
}

function isS3NotFound(error: unknown) {
  return error instanceof S3ServiceException
    && (error.$metadata.httpStatusCode === 404
      || error.name === "NotFound"
      || error.name === "NoSuchKey");
}

async function getStoredAvatarMetadata(path: string) {
  try {
    return await getS3Client().send(new HeadObjectCommand({
      Bucket: storageBucket,
      Key: toAvatarObjectKey(path),
    }));
  } catch (error) {
    if (isS3NotFound(error)) {
      return null;
    }

    throw error;
  }
}

function hasValidAvatarMetadata(metadata: HeadObjectCommandOutput) {
  const contentType = metadata.ContentType?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = metadata.ContentLength ?? 0;

  return Boolean(
    contentType
    && ALLOWED_AVATAR_MIME_TYPES.has(contentType)
    && contentLength > 0
    && contentLength <= MAX_AVATAR_BYTES,
  );
}

async function createAvatarUploadIntent(path: string, contentType: string) {
  const signedUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: storageBucket,
      Key: toAvatarObjectKey(path),
      ContentType: contentType,
    }),
    { expiresIn: AVATAR_UPLOAD_URL_SECONDS },
  );

  return {
    path,
    signedUrl,
    expiresAt: new Date(Date.now() + AVATAR_UPLOAD_URL_SECONDS * 1000).toISOString(),
  };
}

export async function createChildAvatarUploadIntent(input: {
  organizationId: string;
  userId: string;
  file: CreateChildAvatarUploadIntentInput;
}): Promise<CreateChildAvatarUploadIntentResponseDto> {
  const { contentType, extension } = validateAvatarFile(input.file, "Child photos");
  const path = `${input.organizationId}/${input.userId}/${randomUUID()}.${extension}`;
  return createAvatarUploadIntent(path, contentType);
}

export async function createUserAvatarUploadIntent(input: {
  userId: string;
  file: CreateUserAvatarUploadIntentInput;
}): Promise<CreateUserAvatarUploadIntentResponseDto> {
  const { contentType, extension } = validateAvatarFile(input.file, "Profile photos");
  const path = `users/${input.userId}/${randomUUID()}.${extension}`;
  return createAvatarUploadIntent(path, contentType);
}

export async function ensureStoredAvatarExists(path: string) {
  const metadata = await getStoredAvatarMetadata(path);

  if (!metadata || !hasValidAvatarMetadata(metadata)) {
    throw conflict("Uploaded photo could not be found.");
  }

  return metadata;
}

export async function resolveAvatarUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) {
    return null;
  }

  if (!isStoredAvatarPath(pathOrUrl)) {
    return pathOrUrl;
  }

  try {
    const metadata = await getStoredAvatarMetadata(pathOrUrl);

    if (!metadata || !hasValidAvatarMetadata(metadata)) {
      return null;
    }

    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: storageBucket,
        Key: toAvatarObjectKey(pathOrUrl),
      }),
      { expiresIn: AVATAR_SIGNED_URL_SECONDS },
    );
  } catch (error) {
    console.warn("[uploads] failed to resolve stored avatar", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

/** Lists stored avatars under a logical path prefix; returns logical paths. */
export async function listStoredAvatarPaths(prefix: string) {
  const paths: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await getS3Client().send(new ListObjectsV2Command({
      Bucket: storageBucket,
      Prefix: toAvatarObjectKey(prefix),
      ContinuationToken: continuationToken,
    }));
    for (const item of page.Contents ?? []) {
      const path = item.Key ? fromAvatarObjectKey(item.Key) : null;
      if (path) {
        paths.push(path);
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return paths;
}

/** Deletes stored avatars by logical path. */
export async function deleteStoredAvatarPaths(paths: string[]) {
  const uniqueKeys = [...new Set(paths)].filter(Boolean).map(toAvatarObjectKey);

  for (let index = 0; index < uniqueKeys.length; index += 1_000) {
    const chunk = uniqueKeys.slice(index, index + 1_000);
    if (chunk.length === 0) {
      continue;
    }
    await getS3Client().send(new DeleteObjectsCommand({
      Bucket: storageBucket,
      Delete: {
        Objects: chunk.map((Key) => ({ Key })),
        Quiet: true,
      },
    }));
  }
}
