import type { SocketConnectionStatus } from "../../hooks/useCinemaSocket.js";

type SocketStatusIndicatorProps = {
  status: SocketConnectionStatus;
};

const STATUS_LABEL: Record<SocketConnectionStatus, string> = {
  connected: "Live updates on",
  connecting: "Connecting…",
  disconnected: "Live updates off",
};

const STATUS_CLASS: Record<SocketConnectionStatus, string> = {
  connected: "text-emerald-400",
  connecting: "text-amber-400",
  disconnected: "text-red-400",
};

export function SocketStatusIndicator({ status }: SocketStatusIndicatorProps) {
  return (
    <span
      data-testid="socket-status"
      className={`text-xs font-medium ${STATUS_CLASS[status]}`}
      title="WebSocket connection to notification service"
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
