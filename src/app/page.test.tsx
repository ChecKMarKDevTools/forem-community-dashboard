import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import { vi } from "vitest";

// Mock the Dashboard component since it's tested separately
vi.mock("@/components/Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard-mock">Mocked Dashboard</div>,
}));

describe("Home Page", () => {
  it("renders without crashing and includes the Dashboard", () => {
    render(<Home />);

    // Check main container
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass("min-h-screen");

    // Check for dashboard
    const dashboard = screen.getByTestId("dashboard-mock");
    expect(dashboard).toBeInTheDocument();
  });
});
