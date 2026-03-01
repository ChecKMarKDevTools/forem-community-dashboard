import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChartContainer } from "./ChartContainer";
import { LineChart } from "./LineChart";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { DivergingBar } from "./DivergingBar";
import { MarkerTimeline } from "./MarkerTimeline";

// ---------------------------------------------------------------------------
// ChartContainer
// ---------------------------------------------------------------------------

describe("ChartContainer", () => {
  it("renders title and children", () => {
    render(
      <ChartContainer title="Test Chart">
        <p>Chart content</p>
      </ChartContainer>,
    );
    expect(screen.getByText("Test Chart")).toBeInTheDocument();
    expect(screen.getByText("Chart content")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <ChartContainer title="Chart" description="A description">
        <div />
      </ChartContainer>,
    );
    expect(screen.getByText("A description")).toBeInTheDocument();
  });

  it("omits description when not provided", () => {
    const { container } = render(
      <ChartContainer title="Chart">
        <div />
      </ChartContainer>,
    );
    // CardDescription element should not exist
    expect(container.querySelectorAll("p").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LineChart
// ---------------------------------------------------------------------------

describe("LineChart", () => {
  it("renders SVG with correct aria-label", () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
    ];
    render(<LineChart data={data} yLabel="Comments/hr" />);
    expect(
      screen.getByRole("img", { name: /Line chart.*Comments\/hr/ }),
    ).toBeInTheDocument();
  });

  it("renders empty state for no data", () => {
    render(<LineChart data={[]} />);
    expect(
      screen.getByRole("img", { name: "Empty line chart" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders data points as circles", () => {
    const data = [
      { x: 0, y: 5 },
      { x: 1, y: 10 },
    ];
    const { container } = render(<LineChart data={data} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
  });

  it("renders baseline dashed line when provided", () => {
    const data = [
      { x: 0, y: 2 },
      { x: 1, y: 4 },
    ];
    const { container } = render(<LineChart data={data} baseline={3} />);
    const dashedLines = container.querySelectorAll(
      'line[stroke-dasharray="4 3"]',
    );
    expect(dashedLines.length).toBe(1);
  });

  it("handles single data point", () => {
    const data = [{ x: 5, y: 10 }];
    const { container } = render(<LineChart data={data} />);
    expect(container.querySelector("path")).toBeInTheDocument();
    expect(container.querySelectorAll("circle").length).toBe(1);
  });

  it("renders axis labels when provided", () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    render(<LineChart data={data} xLabel="Hours" yLabel="Count" />);
    expect(screen.getByText("Hours")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("applies different series colors", () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    const { container } = render(
      <LineChart data={data} seriesColor="secondary" />,
    );
    const path = container.querySelector("path");
    expect(path?.classList.contains("stroke-chart-series-secondary")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// HorizontalBarChart
// ---------------------------------------------------------------------------

describe("HorizontalBarChart", () => {
  it("renders bars with labels and percentages", () => {
    const data = [
      { label: "alice", value: 0.5 },
      { label: "bob", value: 0.3 },
    ];
    render(<HorizontalBarChart data={data} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("renders empty state for no data", () => {
    render(<HorizontalBarChart data={[]} />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("truncates long labels", () => {
    const data = [{ label: "verylongusernamethatshouldtruncate", value: 0.8 }];
    render(<HorizontalBarChart data={data} />);
    expect(screen.getByText("verylonguse…")).toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    const data = [{ label: "alice", value: 0.5 }];
    render(<HorizontalBarChart data={data} />);
    expect(
      screen.getByRole("img", { name: "Participation distribution chart" }),
    ).toBeInTheDocument();
  });

  it("renders up to 5 bars", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({
      label: `user${i}`,
      value: (5 - i) / 10,
    }));
    const { container } = render(<HorizontalBarChart data={data} />);
    // Each bar has a background rect + fill rect = 2 rects per item, +value label
    const texts = container.querySelectorAll("text");
    // label + pct per bar
    expect(texts.length).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// DivergingBar
// ---------------------------------------------------------------------------

describe("DivergingBar", () => {
  it("renders sentiment percentages", () => {
    render(<DivergingBar positive={40} neutral={30} negative={30} />);
    expect(screen.getByText("40% positive")).toBeInTheDocument();
    expect(screen.getByText("30% neutral")).toBeInTheDocument();
    expect(screen.getByText("30% negative")).toBeInTheDocument();
  });

  it("renders empty state for zero total", () => {
    render(<DivergingBar positive={0} neutral={0} negative={0} />);
    expect(screen.getByText("No sentiment data")).toBeInTheDocument();
  });

  it("has correct aria-label with percentages", () => {
    render(<DivergingBar positive={60} neutral={30} negative={10} />);
    expect(
      screen.getByRole("img", {
        name: "Sentiment: 60% positive, 30% neutral, 10% negative",
      }),
    ).toBeInTheDocument();
  });

  it("hides small positive label when below 5%", () => {
    render(<DivergingBar positive={3} neutral={94} negative={3} />);
    expect(screen.queryByText(/positive/)).not.toBeInTheDocument();
    expect(screen.queryByText(/negative/)).not.toBeInTheDocument();
    expect(screen.getByText("94% neutral")).toBeInTheDocument();
  });

  it("hides neutral label when below 10%", () => {
    render(<DivergingBar positive={50} neutral={5} negative={45} />);
    expect(screen.queryByText(/neutral/)).not.toBeInTheDocument();
    expect(screen.getByText("50% positive")).toBeInTheDocument();
    expect(screen.getByText("45% negative")).toBeInTheDocument();
  });

  it("handles 100% positive", () => {
    render(<DivergingBar positive={100} neutral={0} negative={0} />);
    expect(screen.getByText("100% positive")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MarkerTimeline
// ---------------------------------------------------------------------------

describe("MarkerTimeline", () => {
  it("renders markers with labels", () => {
    const markers = [
      { label: "Freq", active: true },
      { label: "Short", active: false },
      { label: "Promo", active: true },
    ];
    render(<MarkerTimeline markers={markers} />);
    expect(screen.getByText("Freq")).toBeInTheDocument();
    expect(screen.getByText("Short")).toBeInTheDocument();
    expect(screen.getByText("Promo")).toBeInTheDocument();
  });

  it("returns null for empty markers", () => {
    const { container } = render(<MarkerTimeline markers={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders active markers with larger radius and glow", () => {
    const markers = [
      { label: "Active", active: true },
      { label: "Inactive", active: false },
    ];
    const { container } = render(<MarkerTimeline markers={markers} />);
    // Active marker has an extra glow circle (r+3)
    const circles = container.querySelectorAll("circle");
    // Active: main circle + glow circle, Inactive: main circle only = 3
    expect(circles.length).toBe(3);
  });

  it("has correct aria-label", () => {
    const markers = [{ label: "Test", active: false }];
    render(<MarkerTimeline markers={markers} />);
    expect(
      screen.getByRole("img", { name: "Risk signal timeline" }),
    ).toBeInTheDocument();
  });

  it("handles single marker centered", () => {
    const markers = [{ label: "Solo", active: true }];
    const { container } = render(<MarkerTimeline markers={markers} />);
    const circles = container.querySelectorAll("circle");
    // 1 main + 1 glow = 2
    expect(circles.length).toBe(2);
  });
});
