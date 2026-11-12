import twilio from "twilio";

import { env } from "../config/env";

type SendSmsOtpInput = {
  code: string;
  phoneNumber: string;
};

let cachedClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return null;
  }

  cachedClient ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return cachedClient;
}

export async function sendSmsOtp(input: SendSmsOtpInput) {
  if (env.DISABLE_TWILLIO_OTP && env.NODE_ENV !== "production") {
    console.info(`[better-auth] OTP for ${input.phoneNumber}: ${input.code}`);
    return;
  }

  const client = getTwilioClient();

  if (!client || !env.TWILIO_MESSAGING_SERVICE_SID) {
    if (env.NODE_ENV !== "production") {
      console.info(`[better-auth] OTP for ${input.phoneNumber}: ${input.code}`);
      return;
    }

    throw new Error("SMS provider is not configured.");
  }

  await client.messages.create({
    body: `Your Stepwhere verification code is ${input.code}. It expires in 5 minutes.`,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    to: input.phoneNumber,
  });
}

export async function sendAccountDeletionSmsOtp(input: SendSmsOtpInput) {
  if (env.DISABLE_TWILLIO_OTP && env.NODE_ENV !== "production") {
    console.info(`[account-deletion] OTP for ${input.phoneNumber}: ${input.code}`);
    return;
  }

  const client = getTwilioClient();

  if (!client || !env.TWILIO_MESSAGING_SERVICE_SID) {
    if (env.NODE_ENV !== "production") {
      console.info(`[account-deletion] OTP for ${input.phoneNumber}: ${input.code}`);
      return;
    }

    throw new Error("SMS provider is not configured.");
  }

  await client.messages.create({
    body: `Your Stepwhere account deletion code is ${input.code}. It expires in 5 minutes.`,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    to: input.phoneNumber,
  });
}
