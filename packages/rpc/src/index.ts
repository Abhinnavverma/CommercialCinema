import type { handleUnaryCall } from "@grpc/grpc-js";
import type {
  DecrementRequest,
  DecrementResponse,
  GetStockRequest,
  GetStockResponse,
  ReleaseRequest,
  ReleaseResponse,
} from "./types.js";

export * from "./types.js";
export * from "./stock-client.js";
export { stockProto, stockServiceDefinition } from "./proto.js";

// Strongly-typed handler shape the Stock Service implements and registers via
// grpc.Server.addService(stockServiceDefinition, handlers).
export type StockServiceHandlers = {
  GetStock: handleUnaryCall<GetStockRequest, GetStockResponse>;
  Decrement: handleUnaryCall<DecrementRequest, DecrementResponse>;
  Release: handleUnaryCall<ReleaseRequest, ReleaseResponse>;
};
