import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

// Stub navigator.geolocation
Object.defineProperty(global.navigator, "geolocation", {
  value: {
    getCurrentPosition: vi.fn(),
  },
  configurable: true,
  writable: true,
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const SEARCH_RESPONSE = {
  venues: [
    {
      id: "v1",
      name: "Happy Bar",
      address: "1 Main St, Austin, TX",
      distance: "0.2 mi",
      rating: 4.5,
      priceLevel: "$$",
      happyHourTimes: "Mon-Fri 4-7pm",
      deals: ["$4 drafts"],
      matchScore: 95,
      matchReason: "Perfect fit",
      openNow: true,
      categories: ["Bar"],
    },
  ],
  summary: "Found great happy hours near you.",
  searchLocation: "Austin, TX",
  currentTime: "5:00 PM CST",
};

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page header", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /Happiest of Hours/i })).toBeInTheDocument();
  });

  it("renders the location input", () => {
    render(<Home />);
    expect(
      screen.getByPlaceholderText(/Enter city, neighborhood, or address/i)
    ).toBeInTheDocument();
  });

  it("renders the Find Happy Hours button", () => {
    render(<Home />);
    expect(
      screen.getByRole("button", { name: /Find Happy Hours/i })
    ).toBeInTheDocument();
  });

  it("search button is disabled when address is empty", () => {
    render(<Home />);
    const btn = screen.getByRole("button", { name: /Find Happy Hours/i });
    expect(btn).toBeDisabled();
  });

  it("search button becomes enabled when address is typed", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByPlaceholderText(/Enter city/i);
    await user.type(input, "Austin, TX");
    const btn = screen.getByRole("button", { name: /Find Happy Hours/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows validation error when submitting with empty address", async () => {
    render(<Home />);
    const form = screen.getByRole("button", { name: /Find Happy Hours/i }).closest("form")!;
    // Force submit even though button is disabled by firing form submit directly
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText(/Please enter a location/i)).toBeInTheDocument();
    });
  });

  it("renders venue cards after a successful search", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SEARCH_RESPONSE,
    });

    render(<Home />);
    const input = screen.getByPlaceholderText(/Enter city/i);
    await user.type(input, "Austin, TX");

    const btn = screen.getByRole("button", { name: /Find Happy Hours/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText("Happy Bar")).toBeInTheDocument();
    });
    expect(screen.getByText(/Found great happy hours near you/i)).toBeInTheDocument();
  });

  it("shows error message when search API fails", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "AI service unavailable." }),
    });

    render(<Home />);
    const input = screen.getByPlaceholderText(/Enter city/i);
    await user.type(input, "Austin, TX");

    await user.click(screen.getByRole("button", { name: /Find Happy Hours/i }));

    await waitFor(() => {
      expect(screen.getByText(/AI service unavailable/i)).toBeInTheDocument();
    });
  });

  it("shows empty state before searching", () => {
    render(<Home />);
    expect(
      screen.getByText(/Ready to find your perfect happy hour/i)
    ).toBeInTheDocument();
  });

  it("renders all radius options", () => {
    render(<Home />);
    ["0.5 mi", "1 mi", "2 mi", "5 mi", "10 mi"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("renders preference buttons", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /Beer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cocktails/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wine/i })).toBeInTheDocument();
  });
});
