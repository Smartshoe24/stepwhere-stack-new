import type { PublicShareChildDto } from "@stepwhere/types";

import { Clock3, MapPinned, Radio, ShieldCheck } from "lucide-react";

import { formatExpiryCountdown, formatLastUpdated } from "../utils/expiry";
import { getLocationPresentation } from "../utils/location";
import { getStatusLabel, getStatusTone } from "../utils/status";

type ChildStatusPanelProps = {
  child: PublicShareChildDto;
  expiresAt: string;
  nowMs: number;
  socketConnected: boolean;
};

export function ChildStatusPanel({
  child,
  expiresAt,
  nowMs,
  socketConnected,
}: ChildStatusPanelProps) {
  const statusTone = getStatusTone(child.telemetryState);
  const presentation = getLocationPresentation(child);
  const isLive = presentation.kind === "live";
  const trustLabel = !socketConnected
    ? "Updates delayed"
    : presentation.kind === "approximate"
      ? "Approximate location"
      : presentation.kind === "last-known"
        ? "Last known location"
        : "Live updates";

  return (
    <section aria-label={`${child.childName}'s live location status`} className="status-panel">
      <div className="status-panel__header">
        <div className="child-avatar">
          {child.avatarUrl ? (
            <img alt={child.childName} src={child.avatarUrl} />
          ) : (
            <span>{child.initials}</span>
          )}
        </div>
        <div className="status-panel__identity">
          <p className="eyebrow">Shared with you</p>
          <h1>{child.childName}</h1>
          <div className={`status-pill status-pill--${statusTone}`}>
            <ShieldCheck size={14} strokeWidth={2.2} />
            <span>{getStatusLabel(child)}</span>
          </div>
        </div>
      </div>

      <div aria-live="polite" className={`trust-rail trust-rail--${socketConnected && isLive ? "live" : "caution"}`}>
        <div className="trust-rail__state">
          <span className="trust-rail__dot" />
          <div>
            <span>Location status</span>
            <strong>{trustLabel}</strong>
          </div>
        </div>
        <div className="trust-rail__meta">
          <Radio size={15} />
          <div>
            <span>{presentation.kind === "approximate" ? "Last estimate" : "Last fix"}</span>
            <strong>{formatLastUpdated(child.lastUpdatedAt)}</strong>
          </div>
        </div>
        <div className="trust-rail__meta">
          <Clock3 size={15} />
          <div>
            <span>Access</span>
            <strong>{formatExpiryCountdown(expiresAt, nowMs)}</strong>
          </div>
        </div>
      </div>
      <p className="privacy-note"><MapPinned size={14} /> Only people with this private link can view this location.</p>
    </section>
  );
}
