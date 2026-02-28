import { render, screen } from "@testing-library/react";
import { SectionCard } from "./SectionCard";

describe("SectionCard", () => {
  it("renders children", () => {
    render(
      <SectionCard>
        <p>Card content</p>
      </SectionCard>,
    );
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies border-surface-border by default", () => {
    const { container } = render(
      <SectionCard>
        <p>Content</p>
      </SectionCard>,
    );
    expect(container.firstChild).toHaveClass("border-surface-border");
  });

  it("does not apply bg-surface-primary/30 in default variant", () => {
    const { container } = render(
      <SectionCard>
        <p>Content</p>
      </SectionCard>,
    );
    const classList = (container.firstChild as HTMLElement).className;
    expect(classList).not.toContain("bg-surface-primary/30");
  });

  it("applies bg-surface-primary/30 in muted variant", () => {
    const { container } = render(
      <SectionCard variant="muted">
        <p>Content</p>
      </SectionCard>,
    );
    expect(container.firstChild).toHaveClass("bg-surface-primary/30");
  });

  it("applies custom className", () => {
    const { container } = render(
      <SectionCard className="mt-6">
        <p>Content</p>
      </SectionCard>,
    );
    expect(container.firstChild).toHaveClass("mt-6");
  });

  it("renders as a Card with border class", () => {
    const { container } = render(
      <SectionCard>
        <p>Content</p>
      </SectionCard>,
    );
    // Card component adds 'border' class
    expect(container.firstChild).toHaveClass("border");
  });
});
