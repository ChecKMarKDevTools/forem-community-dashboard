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

  it("applies border-brand-100 by default", () => {
    const { container } = render(
      <SectionCard>
        <p>Content</p>
      </SectionCard>,
    );
    expect(container.firstChild).toHaveClass("border-brand-100");
  });

  it("does not apply bg-brand-50/30 in default variant", () => {
    const { container } = render(
      <SectionCard>
        <p>Content</p>
      </SectionCard>,
    );
    const classList = (container.firstChild as HTMLElement).className;
    expect(classList).not.toContain("bg-brand-50/30");
  });

  it("applies bg-brand-50/30 in muted variant", () => {
    const { container } = render(
      <SectionCard variant="muted">
        <p>Content</p>
      </SectionCard>,
    );
    expect(container.firstChild).toHaveClass("bg-brand-50/30");
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
