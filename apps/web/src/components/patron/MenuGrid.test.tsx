import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CartProvider } from "../../context/CartContext.js";
import { CinemaSocketProvider } from "../../context/CinemaSocketContext.js";
import { useCinemaSocket } from "../../hooks/useCinemaSocket.js";
import type { MenuItem } from "../../types/index.js";
import { WS_MESSAGE_TYPE } from "../../types/index.js";
import { MenuGrid } from "./MenuGrid.js";

const menuItems: MenuItem[] = [
  {
    id: "popcorn-lg",
    name: "Large Popcorn",
    description: "Buttery popcorn",
    imageUrl: null,
    priceCents: 899,
    available: 10,
    inStock: true,
  },
  {
    id: "soda-lg",
    name: "Large Soda",
    description: "Fountain drink",
    imageUrl: null,
    priceCents: 549,
    available: 5,
    inStock: true,
  },
];

vi.mock("../../api/menu.js", () => ({
  fetchMenu: vi.fn(() => Promise.resolve({ items: menuItems })),
}));

function TestHarness() {
  const socket = useCinemaSocket({ enabled: false });

  return (
    <CinemaSocketProvider value={socket}>
      <CartProvider>
        <MenuGrid />
        <button
          type="button"
          data-testid="simulate-stock-zero"
          onClick={() =>
            socket.simulateMessage({
              type: WS_MESSAGE_TYPE.STOCK_ZERO,
              itemId: "popcorn-lg",
            })
          }
        >
          Simulate STOCK_ZERO
        </button>
      </CartProvider>
    </CinemaSocketProvider>
  );
}

describe("MenuGrid", () => {
  test("disables Add to Cart for an item after STOCK_ZERO without page reload", async () => {
    render(<TestHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("menu-item-popcorn-lg")).toBeInTheDocument();
    });

    const popcornCard = screen.getByTestId("menu-item-popcorn-lg");
    const sodaCard = screen.getByTestId("menu-item-soda-lg");

    const popcornButton = within(popcornCard).getByRole("button", { name: /add to cart/i });
    const sodaButton = within(sodaCard).getByRole("button", { name: /add to cart/i });

    expect(popcornButton).toBeEnabled();
    expect(sodaButton).toBeEnabled();

    screen.getByTestId("simulate-stock-zero").click();

    await waitFor(() => {
      expect(within(popcornCard).getByRole("button", { name: /sold out/i })).toBeDisabled();
      expect(within(popcornCard).getByTestId("sold-out-popcorn-lg")).toHaveTextContent("Sold out");
    });

    expect(within(sodaCard).getByRole("button", { name: /add to cart/i })).toBeEnabled();
  });
});
