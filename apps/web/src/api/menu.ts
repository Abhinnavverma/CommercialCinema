import { apiRequest } from "./client.js";
import type { MenuResponse } from "../types/index.js";

export function fetchMenu(): Promise<MenuResponse> {
  return apiRequest<MenuResponse>("/menu");
}
