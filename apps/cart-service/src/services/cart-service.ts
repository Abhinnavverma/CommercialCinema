import type { CartItem } from "@commerical-cinema/schema";
import { CART_TTL_SECONDS, buildCartKey } from "../static/index.js";

export type CartRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(key: string): Promise<number>;
};

export class CartService {
  constructor(private readonly redis: CartRedis) {}

  async read(userId: string): Promise<CartItem[]> {
    const raw = await this.redis.get(buildCartKey(userId));
    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as CartItem[];
  }

  async write(userId: string, items: CartItem[]): Promise<void> {
    await this.redis.set(buildCartKey(userId), JSON.stringify(items), "EX", CART_TTL_SECONDS);
  }

  async remove(userId: string): Promise<void> {
    await this.redis.del(buildCartKey(userId));
  }
}
