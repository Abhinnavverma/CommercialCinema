// Canonical concession catalog + opening inventory. Shared by the Postgres seed
// (cold storage) and the Stock Service Redis seed (hot-path source of truth) so both
// stores start from the exact same numbers.
export type SeedProduct = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  initialStock: number;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: "popcorn-lg",
    name: "Large Popcorn",
    description: "Freshly popped, lightly salted with real butter.",
    imageUrl: "https://images.apexflo.local/popcorn-lg.png",
    priceCents: 899,
    initialStock: 1000,
  },
  {
    id: "popcorn-sm",
    name: "Small Popcorn",
    description: "A personal bucket of buttery popcorn.",
    imageUrl: "https://images.apexflo.local/popcorn-sm.png",
    priceCents: 599,
    initialStock: 750,
  },
  {
    id: "soda-lg",
    name: "Large Soda",
    description: "32oz fountain drink, free refills in-lobby.",
    imageUrl: "https://images.apexflo.local/soda-lg.png",
    priceCents: 549,
    initialStock: 1200,
  },
  {
    id: "nachos",
    name: "Loaded Nachos",
    description: "Warm tortilla chips with jalapenos and cheese.",
    imageUrl: "https://images.apexflo.local/nachos.png",
    priceCents: 749,
    initialStock: 400,
  },
  {
    id: "hotdog",
    name: "Classic Hot Dog",
    description: "All-beef hot dog, served hot.",
    imageUrl: "https://images.apexflo.local/hotdog.png",
    priceCents: 699,
    initialStock: 300,
  },
  {
    id: "candy-mix",
    name: "Candy Mix",
    description: "A pick-and-mix bag of cinema favourites.",
    imageUrl: "https://images.apexflo.local/candy-mix.png",
    priceCents: 449,
    initialStock: 500,
  },
  {
    id: "water",
    name: "Bottled Water",
    description: "500ml still water.",
    imageUrl: "https://images.apexflo.local/water.png",
    priceCents: 299,
    initialStock: 2000,
  },
];
