import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { QueueCard } from "./QueueCard";

describe("QueueCard", () => {
  it("renders children inside CardContent", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <h3>Post Title</h3>
      </QueueCard>,
    );
    expect(screen.getByText("Post Title")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(
      <QueueCard selected={false} onClick={handleClick}>
        <p>Click me</p>
      </QueueCard>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies selected styles when selected is true", () => {
    render(
      <QueueCard selected={true} onClick={() => {}}>
        <p>Selected</p>
      </QueueCard>,
    );
    const card = screen.getByRole("button");
    expect(card.className).toContain("ring-2");
    expect(card.className).toContain("bg-surface-secondary");
  });

  it("applies unselected styles when selected is false", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <p>Not selected</p>
      </QueueCard>,
    );
    const card = screen.getByRole("button");
    expect(card.className).toContain("bg-paper-clue");
    expect(card.className).not.toContain("ring-2");
  });

  it("applies custom className", () => {
    render(
      <QueueCard selected={false} onClick={() => {}} className="extra">
        <p>Content</p>
      </QueueCard>,
    );
    expect(screen.getByRole("button")).toHaveClass("extra");
  });

  it("has cursor-pointer class for interaction hint", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <p>Pointer</p>
      </QueueCard>,
    );
    expect(screen.getByRole("button")).toHaveClass("cursor-pointer");
  });

  it("wraps children in p-4 content area", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <span data-testid="inner">Inner</span>
      </QueueCard>,
    );
    const inner = screen.getByTestId("inner");
    const content = inner.closest(".p-4");
    expect(content).toBeInTheDocument();
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("has role=button for assistive tech", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <p>A11y</p>
      </QueueCard>,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has tabIndex=0 for keyboard focusability", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <p>Focus</p>
      </QueueCard>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("tabindex", "0");
  });

  it("sets aria-pressed=true when selected", () => {
    render(
      <QueueCard selected={true} onClick={() => {}}>
        <p>Selected</p>
      </QueueCard>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("sets aria-pressed=false when not selected", () => {
    render(
      <QueueCard selected={false} onClick={() => {}}>
        <p>Unselected</p>
      </QueueCard>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onClick on Enter key press", () => {
    const handleClick = vi.fn();
    render(
      <QueueCard selected={false} onClick={handleClick}>
        <p>Enter</p>
      </QueueCard>,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Space key press", () => {
    const handleClick = vi.fn();
    render(
      <QueueCard selected={false} onClick={handleClick}>
        <p>Space</p>
      </QueueCard>,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick on other key presses", () => {
    const handleClick = vi.fn();
    render(
      <QueueCard selected={false} onClick={handleClick}>
        <p>Tab</p>
      </QueueCard>,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });
    expect(handleClick).not.toHaveBeenCalled();
  });
});
