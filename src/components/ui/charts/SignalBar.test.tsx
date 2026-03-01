import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SignalBar } from "./SignalBar";

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("SignalBar", () => {
  describe("empty state", () => {
    it("renders 'Not enough data yet' when all values are zero", () => {
      render(<SignalBar strong={0} moderate={0} faint={0} />);
      expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    });

    it("does not render stat rows when total is zero", () => {
      render(<SignalBar strong={0} moderate={0} faint={0} />);
      expect(screen.queryByText("Substantive")).not.toBeInTheDocument();
      expect(screen.queryByText("Mixed")).not.toBeInTheDocument();
      expect(screen.queryByText("Surface-level")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Normal rendering
  // ---------------------------------------------------------------------------

  describe("normal rendering", () => {
    it("renders three stat rows with labels", () => {
      render(<SignalBar strong={40} moderate={30} faint={30} />);
      expect(screen.getByText("Substantive")).toBeInTheDocument();
      expect(screen.getByText("Mixed")).toBeInTheDocument();
      expect(screen.getByText("Surface-level")).toBeInTheDocument();
    });

    it("shows correct percentage values", () => {
      render(<SignalBar strong={60} moderate={25} faint={15} />);
      expect(screen.getByText("60%")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("15%")).toBeInTheDocument();
    });

    it("renders progress bars with correct widths", () => {
      const { container } = render(
        <SignalBar strong={60} moderate={20} faint={20} />,
      );
      const bars = container.querySelectorAll("[style]");
      expect(bars.length).toBe(3);
      expect(bars[0]).toHaveStyle({ width: "60%" });
      expect(bars[1]).toHaveStyle({ width: "20%" });
      expect(bars[2]).toHaveStyle({ width: "20%" });
    });
  });

  // ---------------------------------------------------------------------------
  // Percentage calculation
  // ---------------------------------------------------------------------------

  describe("percentage calculation", () => {
    it("normalizes values to 100% total", () => {
      const { container } = render(
        <SignalBar strong={500} moderate={300} faint={200} />,
      );
      const bars = container.querySelectorAll("[style]");
      expect(bars[0]).toHaveStyle({ width: "50%" });
      expect(bars[1]).toHaveStyle({ width: "30%" });
      expect(bars[2]).toHaveStyle({ width: "20%" });
    });

    it("rounds percentages to integers", () => {
      render(<SignalBar strong={33.3} moderate={33.3} faint={33.4} />);
      // All three round to 33%
      const pctLabels = screen.getAllByText("33%");
      expect(pctLabels.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Single segment dominance
  // ---------------------------------------------------------------------------

  describe("single segment dominance", () => {
    it("handles 100% strong", () => {
      const { container } = render(
        <SignalBar strong={100} moderate={0} faint={0} />,
      );
      expect(screen.getByText("100%")).toBeInTheDocument();
      const bars = container.querySelectorAll("[style]");
      expect(bars[0]).toHaveStyle({ width: "100%" });
      expect(bars[1]).toHaveStyle({ width: "0%" });
      expect(bars[2]).toHaveStyle({ width: "0%" });
    });

    it("handles 100% moderate", () => {
      const { container } = render(
        <SignalBar strong={0} moderate={100} faint={0} />,
      );
      expect(screen.getByText("100%")).toBeInTheDocument();
      const bars = container.querySelectorAll("[style]");
      expect(bars[0]).toHaveStyle({ width: "0%" });
      expect(bars[1]).toHaveStyle({ width: "100%" });
      expect(bars[2]).toHaveStyle({ width: "0%" });
    });

    it("handles 100% faint", () => {
      const { container } = render(
        <SignalBar strong={0} moderate={0} faint={100} />,
      );
      expect(screen.getByText("100%")).toBeInTheDocument();
      const bars = container.querySelectorAll("[style]");
      expect(bars[0]).toHaveStyle({ width: "0%" });
      expect(bars[1]).toHaveStyle({ width: "0%" });
      expect(bars[2]).toHaveStyle({ width: "100%" });
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  describe("accessibility", () => {
    it("has an accessible aria-label with readable percentages", () => {
      render(<SignalBar strong={50} moderate={30} faint={20} />);
      const container = screen.getByRole("img");
      expect(container).toHaveAttribute(
        "aria-label",
        "Comment depth: 50% substantive, 30% mixed, 20% surface-level",
      );
    });

    it("rounds percentages in the aria-label", () => {
      render(<SignalBar strong={33.3} moderate={33.3} faint={33.4} />);
      const container = screen.getByRole("img");
      expect(container).toHaveAttribute(
        "aria-label",
        "Comment depth: 33% substantive, 33% mixed, 33% surface-level",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Custom className
  // ---------------------------------------------------------------------------

  describe("custom className", () => {
    it("forwards className to the stat container", () => {
      render(
        <SignalBar
          strong={50}
          moderate={30}
          faint={20}
          className="custom-class"
        />,
      );
      const container = screen.getByRole("img");
      expect(container.classList.contains("custom-class")).toBe(true);
    });

    it("forwards className to the empty state div", () => {
      const { container } = render(
        <SignalBar
          strong={0}
          moderate={0}
          faint={0}
          className="empty-custom"
        />,
      );
      const div = container.querySelector("div");
      expect(div?.classList.contains("empty-custom")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles very small non-zero values without crashing", () => {
      render(<SignalBar strong={0.1} moderate={0.1} faint={0.1} />);
      expect(screen.getByText("Substantive")).toBeInTheDocument();
    });

    it("shows 0% for segments that round to zero", () => {
      render(<SignalBar strong={0.1} moderate={0.1} faint={99.8} />);
      expect(screen.getByText("100%")).toBeInTheDocument();
      const zeros = screen.getAllByText("0%");
      expect(zeros.length).toBe(2);
    });

    it("renders two non-zero segments when one is zero", () => {
      const { container } = render(
        <SignalBar strong={60} moderate={0} faint={40} />,
      );
      const bars = container.querySelectorAll("[style]");
      expect(bars[0]).toHaveStyle({ width: "60%" });
      expect(bars[1]).toHaveStyle({ width: "0%" });
      expect(bars[2]).toHaveStyle({ width: "40%" });
    });
  });
});
