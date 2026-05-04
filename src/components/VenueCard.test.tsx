import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VenueCard from "./VenueCard";
import type { HappyHourVenue } from "@/app/api/search/route";

const BASE_VENUE: HappyHourVenue = {
  id: "v1",
  name: "The Copper Tap",
  address: "101 Congress Ave, Austin, TX",
  distance: "0.3 mi",
  rating: 4.4,
  priceLevel: "$$",
  happyHourTimes: "Mon-Fri 3-7pm",
  deals: ["$3 draft beers", "Half-price nachos"],
  matchScore: 88,
  matchReason: "Craft beer selection matches your preference",
  openNow: true,
  categories: ["Bar", "Brewery"],
};

describe("VenueCard", () => {
  it("renders venue name and address", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText("The Copper Tap")).toBeInTheDocument();
    expect(screen.getByText(/101 Congress Ave/)).toBeInTheDocument();
  });

  it("shows match score badge", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText("88% match")).toBeInTheDocument();
  });

  it("displays happy hour times", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText(/Mon-Fri 3-7pm/)).toBeInTheDocument();
  });

  it("lists all deals", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText("$3 draft beers")).toBeInTheDocument();
    expect(screen.getByText("Half-price nachos")).toBeInTheDocument();
  });

  it("shows 'Open now' when openNow is true", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText(/Open now/i)).toBeInTheDocument();
  });

  it("shows 'Closed' when openNow is false", () => {
    render(<VenueCard venue={{ ...BASE_VENUE, openNow: false }} index={1} />);
    expect(screen.getByText(/Closed/i)).toBeInTheDocument();
  });

  it("shows 'AI TOP PICK' banner only for index 0", () => {
    const { rerender } = render(<VenueCard venue={BASE_VENUE} index={0} />);
    expect(screen.getByText(/AI TOP PICK/i)).toBeInTheDocument();

    rerender(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.queryByText(/AI TOP PICK/i)).not.toBeInTheDocument();
  });

  it("displays rating and price level", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText(/4\.4/)).toBeInTheDocument();
    expect(screen.getByText("$$")).toBeInTheDocument();
  });

  it("shows category tags", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText(/Bar/)).toBeInTheDocument();
    expect(screen.getByText(/Brewery/)).toBeInTheDocument();
  });

  it("renders AI match reason", () => {
    render(<VenueCard venue={BASE_VENUE} index={1} />);
    expect(screen.getByText(/Craft beer selection matches/)).toBeInTheDocument();
  });

  it("handles missing optional fields gracefully", () => {
    const minimal: HappyHourVenue = {
      id: "v2",
      name: "Minimal Bar",
      address: "Unknown St",
      deals: [],
      matchScore: 50,
      matchReason: "",
      categories: [],
    };
    render(<VenueCard venue={minimal} index={1} />);
    expect(screen.getByText("Minimal Bar")).toBeInTheDocument();
  });
});
