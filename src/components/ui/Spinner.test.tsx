import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders with default md size", () => {
    const { container } = render(<Spinner />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner.className).toContain("h-8");
    expect(spinner.className).toContain("w-8");
    expect(spinner.className).toContain("animate-spin");
  });

  it("renders with sm size", () => {
    const { container } = render(<Spinner size="sm" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner.className).toContain("h-6");
    expect(spinner.className).toContain("w-6");
  });

  it("renders with lg size", () => {
    const { container } = render(<Spinner size="lg" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner.className).toContain("h-12");
    expect(spinner.className).toContain("w-12");
  });

  it("applies custom className", () => {
    const { container } = render(<Spinner className="mt-4" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner.className).toContain("mt-4");
  });

  it("always has animate-spin class", () => {
    const { container } = render(<Spinner size="lg" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner.className).toContain("animate-spin");
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("has role=status for screen readers", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label='Loading' for screen readers", () => {
    render(<Spinner />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
});
