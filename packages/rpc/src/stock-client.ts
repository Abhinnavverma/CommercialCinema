import * as grpc from "@grpc/grpc-js";
import { stockProto } from "./proto.js";
import type {
  DecrementRequest,
  DecrementResponse,
  GetStockRequest,
  GetStockResponse,
} from "./types.js";

type UnaryMethod<Req, Res> = (
  request: Req,
  callback: (error: grpc.ServiceError | null, response?: Res) => void,
) => grpc.ClientUnaryCall;

// grpc-js attaches the original PascalCase RPC names to the generated client.
type RawStockClient = grpc.Client & {
  GetStock: UnaryMethod<GetStockRequest, GetStockResponse>;
  Decrement: UnaryMethod<DecrementRequest, DecrementResponse>;
};

export type StockClient = {
  getStock(request: GetStockRequest): Promise<GetStockResponse>;
  decrement(request: DecrementRequest): Promise<DecrementResponse>;
  close(): void;
};

function callUnary<Req, Res>(
  method: UnaryMethod<Req, Res>,
  client: grpc.Client,
  request: Req,
): Promise<Res> {
  return new Promise<Res>((resolve, reject) => {
    method.call(client, request, (error, response) => {
      if (error || !response) {
        reject(error ?? new Error("Empty gRPC response"));
        return;
      }
      resolve(response);
    });
  });
}

export function createStockClient(address: string): StockClient {
  const raw = new stockProto.StockService(
    address,
    grpc.credentials.createInsecure(),
  ) as unknown as RawStockClient;

  return {
    getStock: (request) => callUnary(raw.GetStock, raw, request),
    decrement: (request) => callUnary(raw.Decrement, raw, request),
    close: () => raw.close(),
  };
}
