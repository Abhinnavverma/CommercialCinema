export const CART_TTL_SECONDS = 10800;

export const CART_KEY_PREFIX = "cart:";

export function buildCartKey(userId: string): string {
  return `${CART_KEY_PREFIX}${userId}`;
}
