export type CartItem = {
  catalogItemId: string;
  quantity: number;
  unitPriceCents: number;
  name: string;
};

export type Cart = { items: CartItem[] };
