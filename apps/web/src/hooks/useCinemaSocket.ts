import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WsMessage } from "../types/index.js";
import { WS_MESSAGE_TYPE } from "../types/index.js";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function parseMessage(raw: string): WsMessage | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || !("type" in data)) {
      return null;
    }

    const message = data as WsMessage;
    if (message.type === WS_MESSAGE_TYPE.STOCK_ZERO && typeof message.itemId === "string") {
      return message;
    }
    if (
      message.type === WS_MESSAGE_TYPE.ORDER_STATUS_UPDATED &&
      typeof message.orderId === "string" &&
      typeof message.status === "string"
    ) {
      return message;
    }
    return null;
  } catch {
    return null;
  }
}

export type SocketConnectionStatus = "connecting" | "connected" | "disconnected";

export type CinemaSocketState = {
  zeroStockIds: Set<string>;
  orderStatuses: Map<string, string>;
  connectionStatus: SocketConnectionStatus;
  clearZeroStock: () => void;
  simulateMessage: (message: WsMessage) => void;
};

type UseCinemaSocketOptions = {
  enabled?: boolean;
  onMessage?: (message: WsMessage) => void;
};

export function useCinemaSocket(options: UseCinemaSocketOptions = {}): CinemaSocketState {
  const { enabled = true, onMessage } = options;
  const [zeroStockIds, setZeroStockIds] = useState<Set<string>>(() => new Set());
  const [orderStatuses, setOrderStatuses] = useState<Map<string, string>>(() => new Map());
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>("disconnected");
  const reconnectAttempt = useRef(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const applyMessage = useCallback((message: WsMessage) => {
    if (message.type === WS_MESSAGE_TYPE.STOCK_ZERO) {
      setZeroStockIds((prev) => {
        const next = new Set(prev);
        next.add(message.itemId);
        return next;
      });
    } else if (message.type === WS_MESSAGE_TYPE.ORDER_STATUS_UPDATED) {
      setOrderStatuses((prev) => {
        const next = new Map(prev);
        next.set(message.orderId, message.status);
        return next;
      });
    }
    onMessageRef.current?.(message);
  }, []);

  const clearZeroStock = useCallback(() => {
    setZeroStockIds(new Set());
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      setConnectionStatus("connecting");
      socket = new WebSocket(getWsUrl());

      socket.addEventListener("open", () => {
        reconnectAttempt.current = 0;
        setConnectionStatus("connected");
      });

      socket.addEventListener("message", (event) => {
        const message = parseMessage(typeof event.data === "string" ? event.data : String(event.data));
        if (message) {
          applyMessage(message);
        }
      });

      socket.addEventListener("close", () => {
        setConnectionStatus("disconnected");
        if (closed) {
          return;
        }
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
          RECONNECT_MAX_MS,
        );
        reconnectAttempt.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [enabled, applyMessage]);

  return useMemo(
    () => ({
      zeroStockIds,
      orderStatuses,
      connectionStatus,
      clearZeroStock,
      simulateMessage: applyMessage,
    }),
    [zeroStockIds, orderStatuses, connectionStatus, clearZeroStock, applyMessage],
  );
}
