import { render, screen } from "@testing-library/react";
import { ScoreBar } from "./ScoreBar";

describe("ScoreBar", () => {
  const defaultProps = {
    label: "Activity Level",
    sublabel: "High",
    description: "Very active discussion.",
    value: 15,
    max: 50,
    colorClass: "bg-state-warning",
  };

  it("renders label, sublabel, and description as tooltip", () => {
    render(<ScoreBar {...defaultProps} />);
    expect(screen.getByText("Activity Level")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    // Description lives in the tooltip span (role="tooltip"), still in the DOM
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Very active discussion.",
    );
  });

  it("computes correct width percentage", () => {
    const { container } = render(<ScoreBar {...defaultProps} />);
    const bar = container.querySelector(
      `.${defaultProps.colorClass.replace("/", "\\/")}`,
    );
    expect(bar).toHaveStyle({ width: "30%" }); // 15/50 * 100 = 30%
  });

  it("clamps width to 100%", () => {
    const { container } = render(
      <ScoreBar {...defaultProps} value={60} max={50} />,
    );
    const bar = container.querySelector(
      `.${defaultProps.colorClass.replace("/", "\\/")}`,
    );
    expect(bar).toHaveStyle({ width: "100%" });
  });

  it("renders 0% width for value 0", () => {
    const { container } = render(<ScoreBar {...defaultProps} value={0} />);
    const bar = container.querySelector(
      `.${defaultProps.colorClass.replace("/", "\\/")}`,
    );
    expect(bar).toHaveStyle({ width: "0%" });
  });

  it("applies the colorClass to the fill bar", () => {
    const { container } = render(
      <ScoreBar {...defaultProps} colorClass="bg-state-negative" />,
    );
    const bar = container.querySelector(".bg-state-negative");
    expect(bar).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ScoreBar {...defaultProps} className="mt-4" />,
    );
    expect(container.firstChild).toHaveClass("mt-4");
  });

  it("renders the label text as provided", () => {
    render(<ScoreBar {...defaultProps} />);
    const labelEl = screen.getByText("Activity Level");
    expect(labelEl.tagName).toBe("SPAN");
  });
});
