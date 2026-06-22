import type { WebSocket } from "ws";

export type StockZeroMessage = {
  type: typeof import("../static/notification.constants.js").WS_MESSAGE_TYPE.STOCK_ZERO;
  itemId: string;
};

export type OrderStatusUpdatedMessage = {
  type: typeof import("../static/notification.constants.js").WS_MESSAGE_TYPE.ORDER_STATUS_UPDATED;
  orderId: string;
  status: string;
};

export type BroadcastMessage = StockZeroMessage | OrderStatusUpdatedMessage;

export class BroadcastService {
  private readonly clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
  }

  remove(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  broadcast(message: BroadcastMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  closeAll(): void {
    for (const socket of this.clients) {
      socket.close();
    }
    this.clients.clear();
  }
}
