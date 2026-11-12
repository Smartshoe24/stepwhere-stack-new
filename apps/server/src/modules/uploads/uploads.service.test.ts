import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s3 = vi.hoisted(() => ({
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("../../infrastructure/s3", () => ({
  storageBucket: "stepwhere-test-storage",
  getS3Client: () => ({ send: s3.send }),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: s3.getSignedUrl,
}));

import {
  assertChildAvatarOwnership,
  assertUserAvatarOwnership,
  createChildAvatarUploadIntent,
  createUserAvatarUploadIntent,
  deleteStoredAvatarPaths,
  ensureStoredAvatarExists,
  fromAvatarObjectKey,
  listStoredAvatarPaths,
  resolveAvatarUrl,
  toAvatarObjectKey,
} from "./uploads.service";

const validHead = { ContentType: "image/jpeg", ContentLength: 1024 };

function sentCommands<T>(type: new (...args: never[]) => T): T[] {
  return s3.send.mock.calls
    .map(([command]) => command)
    .filter((command): command is T => command instanceof type);
}

describe("avatar storage keys", () => {
  beforeEach(() => {
    s3.send.mockReset();
    s3.getSignedUrl.mockReset();
    s3.getSignedUrl.mockImplementation(async (_client, command: { input: { Key: string } }) =>
      `https://signed.example/${command.input.Key}`);
  });

  it("maps logical avatar paths to keys under avatars/ and back", () => {
    expect(toAvatarObjectKey("users/u1/a.jpg")).toBe("avatars/users/u1/a.jpg");
    expect(fromAvatarObjectKey("avatars/users/u1/a.jpg")).toBe("users/u1/a.jpg");
    expect(fromAvatarObjectKey("exports/users/u1/a.jpg")).toBeNull();
  });

  it("presigns user avatar uploads under avatars/ but returns the logical path", async () => {
    const intent = await createUserAvatarUploadIntent({
      userId: "user-1",
      file: { fileName: "me.png", contentType: "image/png", fileSize: 2048 },
    });

    expect(intent.path).toMatch(/^users\/user-1\/[0-9a-f-]+\.png$/);
    expect(() => assertUserAvatarOwnership({ userId: "user-1", path: intent.path })).not.toThrow();

    const [, command] = s3.getSignedUrl.mock.calls[0]!;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "stepwhere-test-storage",
      Key: `avatars/${intent.path}`,
      ContentType: "image/png",
    });
  });

  it("presigns child avatar uploads under avatars/ but returns the logical path", async () => {
    const intent = await createChildAvatarUploadIntent({
      organizationId: "org-1",
      userId: "user-1",
      file: { fileName: "kid.webp", contentType: "image/webp", fileSize: 2048 },
    });

    expect(intent.path).toMatch(/^org-1\/user-1\/[0-9a-f-]+\.webp$/);
    expect(() => assertChildAvatarOwnership({
      organizationId: "org-1",
      userId: "user-1",
      path: intent.path,
    })).not.toThrow();
    expect(s3.getSignedUrl.mock.calls[0]![1].input.Key).toBe(`avatars/${intent.path}`);
  });

  it("checks uploaded avatars by their avatars/ key", async () => {
    s3.send.mockResolvedValue(validHead);

    await ensureStoredAvatarExists("users/user-1/a.jpg");

    expect(sentCommands(HeadObjectCommand)[0]!.input).toEqual({
      Bucket: "stepwhere-test-storage",
      Key: "avatars/users/user-1/a.jpg",
    });
  });

  it("resolves a stored path to a signed GET of its avatars/ key", async () => {
    s3.send.mockResolvedValue(validHead);

    const url = await resolveAvatarUrl("org-1/user-1/a.jpg");

    expect(url).toBe("https://signed.example/avatars/org-1/user-1/a.jpg");
    const [, command] = s3.getSignedUrl.mock.calls[0]!;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input.Bucket).toBe("stepwhere-test-storage");
  });

  it("passes external avatar URLs through untouched", async () => {
    await expect(resolveAvatarUrl("https://example.com/a.jpg")).resolves.toBe("https://example.com/a.jpg");
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("lists under avatars/<prefix> and returns logical paths across pages", async () => {
    s3.send
      .mockResolvedValueOnce({
        Contents: [{ Key: "avatars/users/user-1/a.jpg" }],
        IsTruncated: true,
        NextContinuationToken: "next",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "avatars/users/user-1/b.jpg" }, {}],
        IsTruncated: false,
      });

    const paths = await listStoredAvatarPaths("users/user-1/");

    expect(paths).toEqual(["users/user-1/a.jpg", "users/user-1/b.jpg"]);
    const commands = sentCommands(ListObjectsV2Command);
    expect(commands.map((command) => command.input)).toEqual([
      { Bucket: "stepwhere-test-storage", Prefix: "avatars/users/user-1/", ContinuationToken: undefined },
      { Bucket: "stepwhere-test-storage", Prefix: "avatars/users/user-1/", ContinuationToken: "next" },
    ]);
  });

  it("deletes logical paths (as listed or stored) by their avatars/ keys", async () => {
    s3.send.mockResolvedValue({});

    await deleteStoredAvatarPaths(["users/user-1/a.jpg", "org-1/user-1/c.jpg", "users/user-1/a.jpg", ""]);

    const [command] = sentCommands(DeleteObjectsCommand);
    expect(command!.input).toEqual({
      Bucket: "stepwhere-test-storage",
      Delete: {
        Objects: [
          { Key: "avatars/users/user-1/a.jpg" },
          { Key: "avatars/org-1/user-1/c.jpg" },
        ],
        Quiet: true,
      },
    });
  });
});
