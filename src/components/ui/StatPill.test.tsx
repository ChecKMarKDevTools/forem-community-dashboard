import { render, screen } from "@testing-library/react";
import { Heart, MessageSquare } from "lucide-react";
import { StatPill } from "./StatPill";

describe("StatPill", () => {
  it("renders children in a semibold span", () => {
    render(<StatPill>42 Reactions</StatPill>);
    const text = screen.getByText("42 Reactions");
    expect(text.className).toContain("font-semibold");
  });

  it("renders with an icon when provided", () => {
    const { container } = render(
      <StatPill icon={Heart} iconClassName="text-danger-500">
        10
      </StatPill>,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders without icon when not provided", () => {
    const { container } = render(<StatPill>Text only</StatPill>);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<StatPill className="gap-4">Value</StatPill>);
    expect(container.firstChild).toHaveClass("gap-4");
  });

  it("applies iconClassName to the icon", () => {
    const { container } = render(
      <StatPill icon={MessageSquare} iconClassName="text-brand-500">
        5
      </StatPill>,
    );
    const svg = container.querySelector("svg");
    expect(svg?.classList.toString()).toContain("text-brand-500");
  });
});
