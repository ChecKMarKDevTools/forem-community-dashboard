import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders default badge", () => {
    render(<Badge>Test Badge</Badge>);
    const badge = screen.getByText("Test Badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-accent-primary");
  });

  it("renders neutral badge", () => {
    render(<Badge variant="neutral">Routine</Badge>);
    const badge = screen.getByText("Routine");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-neutral-200");
  });

  it("renders info badge", () => {
    render(<Badge variant="info">Active</Badge>);
    const badge = screen.getByText("Active");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-info-100");
  });

  it("renders teal badge", () => {
    render(<Badge variant="teal">Waiting</Badge>);
    const badge = screen.getByText("Waiting");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-teal-100");
  });

  it("renders attention badge", () => {
    render(<Badge variant="attention">Escalating</Badge>);
    const badge = screen.getByText("Escalating");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-attention-100");
  });

  it("renders critical badge", () => {
    render(<Badge variant="critical">Issue</Badge>);
    const badge = screen.getByText("Issue");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-critical-100");
  });

  it("renders violet badge", () => {
    render(<Badge variant="violet">Silent</Badge>);
    const badge = screen.getByText("Silent");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-violet-100");
  });

  it("renders secondary badge", () => {
    render(<Badge variant="secondary">Sec</Badge>);
    const badge = screen.getByText("Sec");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-surface-secondary");
  });

  it("renders outline badge", () => {
    render(<Badge variant="outline">Out</Badge>);
    const badge = screen.getByText("Out");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("text-foreground");
  });

  it("applies custom class names", () => {
    render(<Badge className="custom-class">Test</Badge>);
    const badge = screen.getByText("Test");
    expect(badge).toHaveClass("custom-class");
  });
});
