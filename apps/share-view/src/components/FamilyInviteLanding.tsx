import type { PublicFamilyInvitePreviewDto } from "@stepwhere/types";
import { Clock3, ExternalLink, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  fetchPublicFamilyInvitePreview,
  ShareApiError,
} from "../api/share-client";
import { formatExpiryCountdown } from "../utils/expiry";

type InviteViewState = "loading" | "ready" | "expired" | "unavailable";

export function FamilyInviteLanding() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token")?.trim() ?? "",
    [],
  );
  const [preview, setPreview] = useState<PublicFamilyInvitePreviewDto | null>(null);
  const [state, setState] = useState<InviteViewState>(token ? "loading" : "unavailable");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    void fetchPublicFamilyInvitePreview(token)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setPreview(result);
        setState(result.status === "valid" ? "ready" : result.status);
      })
      .catch((error) => {
        if (!cancelled) {
          setState(
            error instanceof ShareApiError && error.status === 410
              ? "expired"
              : "unavailable",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state !== "ready" || !preview?.expiresAt) {
      return;
    }

    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);

      if (new Date(preview.expiresAt!).getTime() <= nextNow) {
        setState("expired");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [preview?.expiresAt, state]);

  const appUrl = `stepwhere://onboarding/join-family?token=${encodeURIComponent(token)}`;
  const appStoreUrl = import.meta.env.VITE_APP_STORE_URL as string | undefined;
  const playStoreUrl = import.meta.env.VITE_PLAY_STORE_URL as string | undefined;

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-mark" aria-hidden="true">
          <Users size={32} strokeWidth={2.1} />
        </div>
        <p className="eyebrow">StepWhere family invite</p>

        {state === "loading" ? (
          <>
            <h1>Checking your invite…</h1>
            <p>One moment while we verify this secure family link.</p>
          </>
        ) : state === "ready" && preview ? (
          <>
            <h1>Join {preview.familyName ?? "this family"}</h1>
            <p>
              You’ve been invited as a family member. Open StepWhere to review
              and accept the invitation.
            </p>
            <div className="invite-meta">
              <span><ShieldCheck size={17} /> Member access</span>
              <span>
                <Clock3 size={17} /> Expires in {formatExpiryCountdown(preview.expiresAt!, nowMs)}
              </span>
            </div>
            <a className="invite-primary" href={appUrl}>
              Open StepWhere <ExternalLink size={17} />
            </a>
            {(appStoreUrl || playStoreUrl) ? (
              <div className="invite-store-links">
                {appStoreUrl ? <a href={appStoreUrl}>Download for iPhone</a> : null}
                {playStoreUrl ? <a href={playStoreUrl}>Download for Android</a> : null}
              </div>
            ) : (
              <p className="invite-guidance">
                If the app doesn’t open, install StepWhere and return to this link.
              </p>
            )}
          </>
        ) : state === "expired" ? (
          <>
            <h1>This invite has expired</h1>
            <p>Ask the family admin to create a new invite from StepWhere.</p>
          </>
        ) : (
          <>
            <h1>Invite unavailable</h1>
            <p>This link is invalid, revoked, or no longer available.</p>
          </>
        )}
      </section>
    </main>
  );
}
