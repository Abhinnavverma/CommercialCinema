import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

// Resolve the .proto relative to this module so it works under Bun without a build
// step (no copying into dist). fileURLToPath handles Windows drive paths correctly.
const PROTO_PATH = fileURLToPath(new URL("./protos/stock.proto", import.meta.url));

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: Number,
  enums: Number,
  defaults: true,
  oneofs: true,
});

type StockProtoPackage = {
  StockService: grpc.ServiceClientConstructor;
};

const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  stock: StockProtoPackage;
};

export const stockProto = loaded.stock;
export const stockServiceDefinition = stockProto.StockService.service;
