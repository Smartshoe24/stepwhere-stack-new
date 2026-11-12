import { useEffect, useRef, useState } from "react";
import type { PublicShareResponseDto } from "@stepwhere/types";

import { fetchPublicShareSnapshot, ShareApiError } from "./api/share-client";
import wordmarkUrl from "./assets/logo.svg";
import { ChildStatusPanel } from "./components/ChildStatusPanel";
import { FamilyInviteLanding } from "./components/FamilyInviteLanding";
import { ExpiredView } from "./components/ExpiredView";
import { LiveLocationMap } from "./components/LiveLocationMap";
import { LoadingView } from "./components/LoadingView";
import { RecenterButton } from "./components/RecenterButton";
import { UnavailableView } from "./components/UnavailableView";
import { connectPublicShareSocket } from "./realtime/share-socket";
import { getShareTokenFromPathname } from "./utils/expiry";

type ViewState = "ended" | "expired" | "loading" | "ready" | "unavailable";

const CONNECTED_POLL_MS = 60_000;
const DISCONNECTED_POLL_MS = 15_000;
const RECONNECT_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];

export function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/family/join") {
    return <FamilyInviteLanding />;
  }

  return <LiveShareApp />;
}

function LiveShareApp() {
  const token = getShareTokenFromPathname(window.location.pathname);
  const [viewState, setViewState] = useState<ViewState>(token ? "loading" : "unavailable");
  const [snapshot, setSnapshot] = useState<PublicShareResponseDto | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketVersion, setSocketVersion] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [recenterToken, setRecenterToken] = useState(0);
  const [unavailableMessage, setUnavailableMessage] = useState("This location link is unavailable.");
  const [endedMessage, setEndedMessage] = useState("Live location sharing has ended.");
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const remainingMs = new Date(snapshot.expiresAt).getTime() - nowMs;

    if (remainingMs <= 0) {
      setSnapshot(null);
      setViewState("expired");
      setSocketConnected(false);
      socketRef.current?.close();
      return;
    }

    const expiryTimer = setTimeout(() => {
      setSnapshot(null);
      setViewState("expired");
      setSocketConnected(false);
      socketRef.current?.close();
    }, remainingMs);

    return () => {
      clearTimeout(expiryTimer);
    };
  }, [nowMs, snapshot]);

  async function refreshSnapshot() {
    if (!token) {
      setViewState("unavailable");
      return;
    }

    try {
      const nextSnapshot = await fetchPublicShareSnapshot(token);
      setSnapshot(nextSnapshot);
      setViewState("ready");
      setUnavailableMessage("This location link is unavailable.");
    } catch (error) {
      if (error instanceof ShareApiError) {
        if (error.status === 410) {
          setSnapshot(null);
          if (error.code === "SHARE_LINK_EXPIRED") {
            setViewState("expired");
          } else {
            setEndedMessage("The person sharing this location has stopped sharing.");
            setViewState("ended");
          }
          return;
        }

        if (error.status === 404) {
          setSnapshot(null);
          setViewState("unavailable");
          setUnavailableMessage("This location link is unavailable.");
          return;
        }
      }

      if (!snapshot) {
        setViewState("unavailable");
        setUnavailableMessage("Unable to load the live location right now.");
      }
    }
  }

  useEffect(() => {
    void refreshSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (viewState !== "ready" || !snapshot) {
      return;
    }

    const delay = socketConnected ? CONNECTED_POLL_MS : DISCONNECTED_POLL_MS;
    const timer = setInterval(() => {
      void refreshSnapshot();
    }, delay);

    return () => {
      clearInterval(timer);
    };
  }, [socketConnected, snapshot, viewState]);

  useEffect(() => {
    if (!token || viewState !== "ready" || !snapshot) {
      return;
    }

    let disposed = false;
    socketRef.current = connectPublicShareSocket(token, {
      onOpen: () => {
        if (disposed) {
          return;
        }

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        reconnectAttemptRef.current = 0;
        setSocketConnected(true);
      },
      onMessage: (event) => {
        if (disposed) {
          return;
        }

        if (event.type === "share.snapshot") {
          setSnapshot(event.data);
          setViewState("ready");
          return;
        }

        if (event.type === "share.child.updated") {
          setSnapshot((current) => current ? { ...current, child: event.data } : current);
          return;
        }

        if (event.type !== "share.ended") {
          // Ignore events this viewer doesn't know yet (e.g. future heartbeats)
          // instead of treating them as the end of the share.
          return;
        }

        setSnapshot(null);
        if (event.data.reason === "expired") {
          setViewState("expired");
        } else {
          setEndedMessage(
            event.data.reason === "replaced"
              ? "A new private link has replaced this one."
              : "The person sharing this location has stopped sharing.",
          );
          setViewState("ended");
        }
        setSocketConnected(false);
      },
      onClose: () => {
        if (disposed) {
          return;
        }

        setSocketConnected(false);
        const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          void refreshSnapshot();
          setSocketVersion((value) => value + 1);
        }, delay);
      },
      onError: () => {
        setSocketConnected(false);
      },
    });

    return () => {
      disposed = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.expiresAt, socketVersion, token, viewState]);

  if (!token) {
    return <UnavailableView />;
  }

  if (viewState === "loading" && !snapshot) {
    return <LoadingView />;
  }

  if (viewState === "expired") {
    return <ExpiredView />;
  }

  if (viewState === "ended") {
    return <UnavailableView message={endedMessage} title="Sharing ended" />;
  }

  if (viewState === "unavailable" && !snapshot) {
    return <UnavailableView message={unavailableMessage} />;
  }

  if (!snapshot) {
    return <LoadingView />;
  }

  return (
    <main className="share-app">
      <section aria-label="Live location map" className="share-stage">
        <LiveLocationMap
          apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""}
          child={snapshot.child}
          recenterToken={recenterToken}
        />

        <header className="viewer-chrome">
          <div className="viewer-brand">
            <img alt="Stepwhere" className="viewer-brand__wordmark" src={wordmarkUrl} />
          </div>
          <span className="viewer-chrome__privacy"><span /> Private live link</span>
        </header>

        <div className="share-stage__panel">
          <ChildStatusPanel
            child={snapshot.child}
            expiresAt={snapshot.expiresAt}
            nowMs={nowMs}
            socketConnected={socketConnected}
          />
        </div>

        {snapshot.child.latitude != null && snapshot.child.longitude != null ? (
          <div className="share-stage__controls">
            <RecenterButton onClick={() => setRecenterToken((value) => value + 1)} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
