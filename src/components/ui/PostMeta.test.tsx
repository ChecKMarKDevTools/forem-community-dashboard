import { render, screen } from "@testing-library/react";
import { PostMeta } from "./PostMeta";

describe("PostMeta", () => {
  describe("compact variant (default)", () => {
    it("renders author with @ prefix", () => {
      render(<PostMeta author="testuser" date="2023-10-27T10:00:00Z" />);
      expect(screen.getByText("@testuser")).toBeInTheDocument();
    });

    it("renders date using toLocaleDateString", () => {
      render(<PostMeta author="testuser" date="2023-10-27T10:00:00Z" />);
      // toLocaleDateString output varies by locale, just check something renders
      const dateStr = new Date("2023-10-27T10:00:00Z").toLocaleDateString();
      expect(screen.getByText(dateStr)).toBeInTheDocument();
    });

    it("uses text-xs sizing", () => {
      render(<PostMeta author="testuser" date="2023-10-27T10:00:00Z" />);
      expect(screen.getByText("@testuser").closest("div")).toHaveClass(
        "text-xs",
      );
    });

    it("renders small icons (h-3 w-3)", () => {
      const { container } = render(
        <PostMeta author="testuser" date="2023-10-27T10:00:00Z" />,
      );
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBe(2);
      for (const svg of svgs) {
        expect(svg.classList.toString()).toContain("h-3");
      }
    });
  });

  describe("full variant", () => {
    it("renders author with pill styling", () => {
      render(
        <PostMeta
          author="testuser"
          date="2023-10-27T10:00:00Z"
          variant="full"
        />,
      );
      expect(screen.getByText("@testuser")).toBeInTheDocument();
      const pillSpan = screen.getByText("@testuser").closest("span");
      expect(pillSpan?.className).toContain("rounded-full");
    });

    it("renders date using toLocaleDateString with month/day/year format", () => {
      render(
        <PostMeta
          author="testuser"
          date="2023-10-27T10:00:00Z"
          variant="full"
        />,
      );
      const dateStr = new Date("2023-10-27T10:00:00Z").toLocaleDateString(
        undefined,
        { year: "numeric", month: "short", day: "numeric" },
      );
      expect(screen.getByText(dateStr)).toBeInTheDocument();
    });

    it("uses text-sm sizing", () => {
      const { container } = render(
        <PostMeta
          author="testuser"
          date="2023-10-27T10:00:00Z"
          variant="full"
        />,
      );
      expect(container.firstChild).toHaveClass("text-sm");
    });

    it("renders larger icons (h-4 w-4)", () => {
      const { container } = render(
        <PostMeta
          author="testuser"
          date="2023-10-27T10:00:00Z"
          variant="full"
        />,
      );
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBe(2);
      for (const svg of svgs) {
        expect(svg.classList.toString()).toContain("h-4");
      }
    });
  });

  it("applies custom className", () => {
    const { container } = render(
      <PostMeta author="user" date="2023-10-27T10:00:00Z" className="mt-2" />,
    );
    expect(container.firstChild).toHaveClass("mt-2");
  });
});
