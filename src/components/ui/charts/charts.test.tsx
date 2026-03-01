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

  it("renders tooltip with HelpCircle when provided", () => {
    render(
      <ChartContainer title="Chart" tooltip="Helpful explanation">
        <div />
      </ChartContainer>,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Helpful explanation",
    );
  });

  it("omits tooltip when not provided", () => {
    render(
      <ChartContainer title="Chart">
        <div />
      </ChartContainer>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("tooltip button has accessible name derived from title", () => {
    render(
      <ChartContainer title="Reply Velocity" tooltip="Some help text">
        <div />
      </ChartContainer>,
    );
    const btn = screen.getByRole("button", { name: "Help: Reply Velocity" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-describedby");
  });
});

// ---------------------------------------------------------------------------
// LineChart
// ---------------------------------------------------------------------------

describe("LineChart", () => {
  it("renders SVG with accessible title", () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
    ];
    const { container } = render(
      <LineChart data={data} yLabel="Comments/hr" />,
    );
    const title = container.querySelector("svg title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toMatch(/Line chart.*Comments\/hr/);
  });

  it("renders empty state for no data", () => {
    render(<LineChart data={[]} />);
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

  it("has accessible title", () => {
    const data = [{ label: "alice", value: 0.5 }];
    const { container } = render(<HorizontalBarChart data={data} />);
    const title = container.querySelector("svg title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("Participation distribution chart");
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

  it("scales bar widths directly to share values so labels match bar lengths", () => {
    // With relative-to-max scaling alice's bar would be 100% and bob's 60%
    // even though labels say 50% and 30%. Direct scaling keeps them aligned.
    const data = [
      { label: "alice", value: 0.5 },
      { label: "bob", value: 0.3 },
    ];
    const { container } = render(<HorizontalBarChart data={data} />);
    // SVG rects: bg-alice, fill-alice, bg-bob, fill-bob
    const rects = container.querySelectorAll("rect");
    const aliceFill = Number(rects[1]?.getAttribute("width"));
    const bobFill = Number(rects[3]?.getAttribute("width"));
    // Ratio of fill widths should match ratio of share values
    expect(aliceFill / bobFill).toBeCloseTo(0.5 / 0.3, 1);
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

  it("has accessible title with percentages", () => {
    const { container } = render(
      <DivergingBar positive={60} neutral={30} negative={10} />,
    );
    const title = container.querySelector("svg title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe(
      "Sentiment: 60% positive, 30% neutral, 10% negative",
    );
  });

  it("hides small positive label when below 5%", () => {
    const { container } = render(
      <DivergingBar positive={3} neutral={94} negative={3} />,
    );
    // Visible SVG text labels should not include "positive" or "negative"
    const textEls = container.querySelectorAll("svg text");
    const labels = Array.from(textEls).map((el) => el.textContent);
    expect(labels.some((l) => l?.includes("positive"))).toBe(false);
    expect(labels.some((l) => l?.includes("negative"))).toBe(false);
    expect(screen.getByText("94% neutral")).toBeInTheDocument();
  });

  it("hides neutral label when below 10%", () => {
    const { container } = render(
      <DivergingBar positive={50} neutral={5} negative={45} />,
    );
    // Visible SVG text labels should not include "neutral"
    const textEls = container.querySelectorAll("svg text");
    const labels = Array.from(textEls).map((el) => el.textContent);
    expect(labels.some((l) => l?.includes("neutral"))).toBe(false);
    expect(screen.getByText("50% positive")).toBeInTheDocument();
    expect(screen.getByText("45% negative")).toBeInTheDocument();
  });

  it("handles 100% positive", () => {
    render(<DivergingBar positive={100} neutral={0} negative={0} />);
    expect(screen.getByText("100% positive")).toBeInTheDocument();
  });

  it("renders without crashing when upstream passes pos+neg > 100 (edge case)", () => {
    // buildSentimentSpread normalises before calling DivergingBar, but verify
    // the component itself handles the overflow case without throwing.
    render(<DivergingBar positive={80} neutral={0} negative={60} />);
    expect(screen.getByText("80% positive")).toBeInTheDocument();
    expect(screen.getByText("60% negative")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MarkerTimeline
// ---------------------------------------------------------------------------

describe("MarkerTimeline", () => {
  it("renders markers with labels", () => {
    const markers = [
      { label: "Frequency Penalty", active: true },
      { label: "Short Content", active: false },
      { label: "Promotional Keywords", active: true },
    ];
    render(<MarkerTimeline markers={markers} />);
    expect(screen.getByText("Frequency Penalty")).toBeInTheDocument();
    expect(screen.getByText("Short Content")).toBeInTheDocument();
    expect(screen.getByText("Promotional Keywords")).toBeInTheDocument();
  });

  it("shows disabled state for empty markers", () => {
    const { container } = render(<MarkerTimeline markers={[]} />);
    const title = container.querySelector("svg title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("No risk signals detected");
  });

  it("shows disabled state when all markers are inactive, still rendering labels", () => {
    const markers = [
      { label: "Frequency Penalty", active: false },
      { label: "Short Content", active: false },
    ];
    const { container } = render(<MarkerTimeline markers={markers} />);
    const title = container.querySelector("svg title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("No risk signals detected");
    // Labels must still be visible so users can see which signals were checked
    expect(screen.getByText("Frequency Penalty")).toBeInTheDocument();
    expect(screen.getByText("Short Content")).toBeInTheDocument();
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

  it("has accessible title when markers are active", () => {
    const markers = [{ label: "Test", active: true }];
    const { container } = render(<MarkerTimeline markers={markers} />);
    const title = container.querySelector("svg title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("Risk signal timeline");
  });

  it("handles single marker centered", () => {
    const markers = [{ label: "Solo", active: true }];
    const { container } = render(<MarkerTimeline markers={markers} />);
    const circles = container.querySelectorAll("circle");
    // 1 main + 1 glow = 2
    expect(circles.length).toBe(2);
  });
});
