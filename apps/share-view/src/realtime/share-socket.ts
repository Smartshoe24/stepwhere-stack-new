import type { PublicShareSocketEvent } from "@stepwhere/types";

import { getPublicShareSocketUrl } from "../api/share-client";

export function connectPublicShareSocket(token: string, handlers: {
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage: (event: PublicShareSocketEvent) => void;
  onOpen?: () => void;
}) {
  const socket = new WebSocket(getPublicShareSocketUrl(token));

  socket.onopen = () => {
    handlers.onOpen?.();
  };

  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data) as PublicShareSocketEvent;
    handlers.onMessage(payload);
  };

  socket.onerror = (event) => {
    handlers.onError?.(event);
  };

  socket.onclose = (event) => {
    handlers.onClose?.(event);
  };

  return socket;
}
