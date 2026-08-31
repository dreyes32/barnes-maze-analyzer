import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("demo analysis, correction, reload, parameter change, and CSV export", async ({ page }) => {
  const downloads: string[] = [];
  page.on("download", (download) => {
    downloads.push(download.suggestedFilename());
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Barnes Maze Analyzer" })).toBeVisible();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(page.getByText("Example analysis")).toBeVisible();
  await expect(page.getByText("Primary latency")).toBeVisible();

  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await page.getByRole("button", { name: "Correct body" }).click();
  await page.getByRole("button", { name: "Mark hidden in hole" }).click();
  await expect(page.getByText("Manual correction", { exact: false })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("hidden", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Results" }).click();
  const before = await page.getByText(/Changing|detected visits|Primary errors|Strategy/).first().textContent();
  await page.getByLabel("Minimum investigation (s)").fill("0.4");
  await page.getByLabel("Minimum investigation (s)").blur();
  await expect(page.getByText(/minimum investigation duration/i)).toBeVisible();
  expect(before).toBeTruthy();

  await page.getByRole("button", { name: "Download CSV" }).click();
  await expect.poll(() => downloads.some((name) => name.endsWith(".csv"))).toBe(true);
});

test("keyboard navigation and 200% zoom remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto("./");
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await page.getByRole("button", { name: "Load demo analysis" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Example analysis")).toBeVisible();
  await page.getByRole("button", { name: "Videos" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Videos" })).toBeVisible();
});

test("no major axe violations on demo results", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious, serious.map((item) => item.id).join(", ")).toEqual([]);
});
