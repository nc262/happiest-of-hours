import { test, expect } from "@playwright/test";

const MOCK_SEARCH_RESPONSE = {
  venues: [
    {
      id: "v1",
      name: "The Amber Tap",
      address: "123 Main St, Austin, TX",
      distance: "0.3 mi",
      rating: 4.5,
      priceLevel: "$$",
      happyHourTimes: "Mon-Fri 4-7pm",
      deals: ["$3 draft beers", "$5 well drinks", "$6 house wine"],
      matchScore: 95,
      matchReason: "Great beer selection with strong happy hour discounts",
      openNow: true,
      categories: ["Bar", "Sports Bar"],
      regularPrices: { beer: 7.0, cocktail: 12.0, wine: 10.0 },
      happyHourPrices: { beer: 3.0, cocktail: 7.0, wine: 6.0 },
      todayHappyHourStart: "16:00",
      todayHappyHourEnd: "19:00",
    },
    {
      id: "v2",
      name: "Sip & Socialize",
      address: "456 Oak Ave, Austin, TX",
      distance: "0.8 mi",
      rating: 4.2,
      priceLevel: "$$$",
      happyHourTimes: "Daily 5-8pm",
      deals: ["$7 craft cocktails", "$4 house wine"],
      matchScore: 82,
      matchReason: "Excellent cocktail menu with evening happy hour",
      openNow: false,
      categories: ["Cocktail Bar"],
      regularPrices: { beer: 8.0, cocktail: 14.0, wine: 12.0 },
      happyHourPrices: { beer: 5.0, cocktail: 7.0, wine: 4.0 },
      todayHappyHourStart: "17:00",
      todayHappyHourEnd: "20:00",
    },
  ],
  summary:
    "Two great options nearby with strong drink deals and convenient happy hour windows.",
  searchLocation: "Austin, TX",
  currentTime: "5:00 PM CST",
};

test.describe("Happy hour search", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the /api/search endpoint so no real API keys are needed
    await page.route("**/api/search", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SEARCH_RESPONSE),
      });
    });
  });

  test("loads the home page with title and search form", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Happiest of Hours/i);
    await expect(
      page.getByRole("heading", { name: /Happiest of Hours/i })
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/Enter city, neighborhood, or address/i)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Find Happy Hours/i })
    ).toBeVisible();
  });

  test("shows empty state message before searching", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Ready to find your perfect happy hour/i)
    ).toBeVisible();
  });

  test("search button is disabled when location is empty", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Find Happy Hours/i })
    ).toBeDisabled();
  });

  test("renders drink preference filters (no food options)", async ({
    page,
  }) => {
    await page.goto("/");

    // Drinks should be present
    await expect(page.getByRole("button", { name: /Beer/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cocktails/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Wine/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Non-Alcoholic/ })
    ).toBeVisible();

    // Food options must NOT appear
    await expect(
      page.getByRole("button", { name: /^Food/ })
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Appetizers/ })
    ).not.toBeVisible();
  });

  test("full search flow: enter location, select preferences, view results", async ({
    page,
  }) => {
    await page.goto("/");

    // Type a location
    await page
      .getByPlaceholder(/Enter city, neighborhood, or address/i)
      .fill("Austin, TX");

    // Select Beer and Cocktails preferences
    await page.getByRole("button", { name: /Beer/ }).click();
    await page.getByRole("button", { name: /Cocktails/ }).click();

    // Submit the search
    await page.getByRole("button", { name: /Find Happy Hours/i }).click();

    // Results should appear
    await expect(page.getByText(/AI Summary/i)).toBeVisible();
    await expect(page.getByText("The Amber Tap")).toBeVisible();
    await expect(page.getByText("Sip & Socialize")).toBeVisible();

    // Top pick badge on first result
    await expect(page.getByText(/AI TOP PICK/i)).toBeVisible();

    // Deals should be displayed
    await expect(page.getByText("$3 draft beers")).toBeVisible();
  });

  test("shows price dashboard with drink tabs after search", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByPlaceholder(/Enter city, neighborhood, or address/i)
      .fill("Austin, TX");
    await page.getByRole("button", { name: /Find Happy Hours/i }).click();

    // Price dashboard should be visible
    await expect(page.getByText(/Price Dashboard/i)).toBeVisible();

    // Drink tabs
    await expect(page.getByRole("button", { name: /Beer/ }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Cocktails/ }).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Wine/ }).first()).toBeVisible();
  });

  test("selecting a radius option highlights it", async ({ page }) => {
    await page.goto("/");

    const fiveMileBtn = page.getByRole("button", { name: "5 mi" });
    await fiveMileBtn.click();

    // The selected button should have the active amber style
    await expect(fiveMileBtn).toHaveClass(/bg-amber-500/);
  });

  test("API error is displayed to the user", async ({ page }) => {
    // Override the route mock to return an error
    await page.route("**/api/search", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "You exceeded your current quota, please check your plan and billing details.",
        }),
      });
    });

    await page.goto("/");
    await page
      .getByPlaceholder(/Enter city, neighborhood, or address/i)
      .fill("Austin, TX");
    await page.getByRole("button", { name: /Find Happy Hours/i }).click();

    await expect(page.getByText(/exceeded your current quota/i)).toBeVisible();
  });
});
