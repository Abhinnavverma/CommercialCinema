// Hand-written TS mirrors of the protobuf messages. proto-loader runs with
// keepCase:false, so snake_case proto fields surface as camelCase at runtime.

export type StockLevel = {
  itemId: string;
  available: number;
};

export type GetStockRequest = {
  itemIds: string[];
};

export type GetStockResponse = {
  levels: StockLevel[];
};

export type DecrementRequest = {
  itemId: string;
  quantity: number;
};

export type DecrementResponse = {
  code: number;
  remaining: number;
};

export type ReleaseRequest = {
  itemId: string;
  quantity: number;
};

export type ReleaseResponse = {
  remaining: number;
};
