export type CreateChildAvatarUploadIntentInput = {
  fileName: string;
  contentType: string;
  fileSize: number;
};

export type CreateChildAvatarUploadIntentResponseDto = {
  path: string;
  signedUrl: string;
  expiresAt: string;
};

export type CreateUserAvatarUploadIntentInput = {
  fileName: string;
  contentType: string;
  fileSize: number;
};

export type CreateUserAvatarUploadIntentResponseDto = {
  path: string;
  signedUrl: string;
  expiresAt: string;
};
