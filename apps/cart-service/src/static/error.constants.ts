export const ERROR_MESSAGES = {
  INVALID_CART_ITEM: "Invalid cart item payload",
  CATALOG_ITEM_ID_REQUIRED: "catalogItemId is required",
  cartItemNotFound: (catalogItemId: string) => `Cart item not found: ${catalogItemId}`,
} as const;
