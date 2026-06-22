import { and, eq } from "drizzle-orm";
import { catalogItems, type CatalogItem, type Db } from "@commerical-cinema/schema";
import type { StockClient } from "@commerical-cinema/rpc";

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: number;
  inStock: boolean;
};

export class MenuService {
  // The catalog (names/prices/images) is effectively static, so it is held in memory
  // and loaded once at boot. GET /menu never touches Postgres on the read path; only
  // live stock is fetched per request, from the Stock Service over gRPC (CQRS reads).
  private catalog: CatalogItem[] = [];

  constructor(
    private readonly db: Db,
    private readonly stockClient: StockClient,
  ) {}

  async loadCatalog(): Promise<void> {
    this.catalog = await this.db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.isActive, true));
  }

  async getMenu(): Promise<MenuItem[]> {
    if (this.catalog.length === 0) {
      return [];
    }

    const itemIds = this.catalog.map((item) => item.id);
    const { levels } = await this.stockClient.getStock({ itemIds });
    const stockByItem = new Map(levels.map((level) => [level.itemId, level.available]));

    return this.catalog.map((item) => {
      const available = stockByItem.get(item.id) ?? 0;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        priceCents: item.priceCents,
        available,
        inStock: available > 0,
      };
    });
  }

  // Single-item detail view. Unlike getMenu (served from the in-memory catalog), this
  // reads the static row straight from Postgres so a freshly added/edited item is
  // reflected without a service restart, then merges the live count from the Stock
  // Service (Redis-backed) over gRPC. Returns null when the item is absent or inactive.
  async getMenuItem(id: string): Promise<MenuItem | null> {
    const [item] = await this.db
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.isActive, true)));

    if (!item) {
      return null;
    }

    const { levels } = await this.stockClient.getStock({ itemIds: [id] });
    const available = levels.find((level) => level.itemId === id)?.available ?? 0;

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      priceCents: item.priceCents,
      available,
      inStock: available > 0,
    };
  }
}
