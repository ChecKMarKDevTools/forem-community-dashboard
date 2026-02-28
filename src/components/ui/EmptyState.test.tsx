import { render, screen } from "@testing-library/react";
import { AlertCircle, MessageSquare } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders default variant with icon and title", () => {
    render(<EmptyState icon={AlertCircle} title="No data" />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("renders default variant with optional description", () => {
    render(
      <EmptyState
        icon={AlertCircle}
        title="No data"
        description="Try again later"
      />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Try again later")).toBeInTheDocument();
  });

  it("renders prominent variant with circular icon wrapper", () => {
    const { container } = render(
      <EmptyState
        icon={MessageSquare}
        title="Select a post"
        description="Details will appear here."
        variant="prominent"
      />,
    );
    expect(screen.getByText("Select a post")).toBeInTheDocument();
    expect(screen.getByText("Details will appear here.")).toBeInTheDocument();
    // Prominent variant has the circular icon wrapper
    const iconWrapper = container.querySelector(
      ".rounded-full.bg-surface-secondary",
    );
    expect(iconWrapper).toBeInTheDocument();
  });

  it("does not render description when not provided in prominent variant", () => {
    render(
      <EmptyState
        icon={MessageSquare}
        title="Select a post"
        variant="prominent"
      />,
    );
    expect(screen.getByText("Select a post")).toBeInTheDocument();
    // Only one text element (no description paragraph)
    const paragraphs = screen.getAllByText(/.+/);
    expect(paragraphs.length).toBe(1);
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState
        icon={AlertCircle}
        title="No data"
        className="custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
