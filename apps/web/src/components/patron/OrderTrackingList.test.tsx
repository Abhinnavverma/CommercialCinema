import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { Order } from "@commerical-cinema/schema";
import { CinemaSocketProvider } from "../../context/CinemaSocketContext.js";
import { useCinemaSocket } from "../../hooks/useCinemaSocket.js";
import { OrderTrackingList } from "./OrderTrackingList.js";

const placedOrder: Order = {
  id: "order-1",
  userId: "user-1",
  status: "placed",
  totalCents: 899,
  screenNumber: 1,
  seatNumber: "A12",
  showtime: new Date("2026-06-22T20:00:00.000Z"),
  paymentRef: "pay_1",
  createdAt: new Date("2026-06-22T19:00:00.000Z"),
};

const preparingOrder: Order = {
  id: "order-2",
  userId: "user-1",
  status: "preparing",
  totalCents: 549,
  screenNumber: 2,
  seatNumber: "B5",
  showtime: new Date("2026-06-22T21:00:00.000Z"),
  paymentRef: "pay_2",
  createdAt: new Date("2026-06-22T18:00:00.000Z"),
};

function TestHarness({
  orders,
  onCancel = vi.fn(async () => undefined),
}: {
  orders: Order[];
  onCancel?: (orderId: string) => Promise<void>;
}) {
  const socket = useCinemaSocket({ enabled: false });

  return (
    <CinemaSocketProvider value={socket}>
      <OrderTrackingList orders={orders} onDismiss={() => undefined} onCancel={onCancel} />
    </CinemaSocketProvider>
  );
}

describe("OrderTrackingList", () => {
  test("renders all in-progress orders from hydrated API data", async () => {
    render(<TestHarness orders={[placedOrder, preparingOrder]} />);

    await waitFor(() => {
      expect(screen.getByTestId("order-tracking-order-1")).toBeInTheDocument();
      expect(screen.getByTestId("order-tracking-order-2")).toBeInTheDocument();
    });

    expect(screen.getByText(/Screen 1 · Seat A12/)).toBeInTheDocument();
    expect(screen.getByText(/Screen 2 · Seat B5/)).toBeInTheDocument();
  });

  test("shows Cancel Order for placed orders but not preparing", async () => {
    render(<TestHarness orders={[placedOrder, preparingOrder]} />);

    await waitFor(() => {
      expect(screen.getByTestId("order-tracking-order-1")).toBeInTheDocument();
    });

    const placedCard = screen.getByTestId("order-tracking-order-1");
    const preparingCard = screen.getByTestId("order-tracking-order-2");

    expect(placedCard).toHaveTextContent("Cancel Order");
    expect(preparingCard).not.toHaveTextContent("Cancel Order");
  });

  test("calls onCancel when Cancel Order is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn(async () => undefined);

    render(<TestHarness orders={[placedOrder]} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel order/i }));

    expect(onCancel).toHaveBeenCalledWith("order-1");
  });
});
