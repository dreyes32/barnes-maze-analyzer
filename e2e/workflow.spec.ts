import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function workflowStep(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Analysis workflow" }).getByRole("button", { name: new RegExp(name) });
}

test("demo analysis, correction, reload, parameter change, and CSV export", async ({ page }) => {
  const downloads: string[] = [];
  page.on("download", (download) => {
    downloads.push(download.suggestedFilename());
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Barnes Maze Analyzer", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(page.getByText("Example analysis", { exact: true })).toBeVisible();
  await expect(page.getByText("Primary latency", { exact: true })).toBeVisible();
  const pathBefore = await page.locator(".metric").filter({ hasText: "Path length" }).locator("dd").innerText();

  await workflowStep(page, "Review").click();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Correct body" }).click();
  await page.getByRole("button", { name: "Mark hidden in hole" }).click();
  await expect(page.getByText(/Manual correction at/)).toBeVisible({ timeout: 10_000 });

  await workflowStep(page, "Results").click();
  const pathAfter = await page.locator(".metric").filter({ hasText: "Path length" }).locator("dd").innerText();
  expect(pathAfter, "a tracking correction must recompute metrics").not.toEqual(pathBefore);

  await page.reload();
  await workflowStep(page, "Review").click();
  await expect(page.getByText(/Manual correction at/)).toBeVisible();
  await expect(page.getByText(/t = 0\.000 s · hidden · manual/)).toBeVisible();

  await workflowStep(page, "Results").click();
  await page.getByLabel("Minimum investigation (s)").fill("0.4");
  await page.getByLabel("Minimum investigation (s)").blur();
  await expect(page.getByText(/minimum investigation duration/i)).toBeVisible();

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
  await expect(page.getByText("Example analysis", { exact: true })).toBeVisible();
  await workflowStep(page, "Videos").press("Enter");
  await expect(page.getByRole("heading", { name: "Videos" })).toBeVisible();
});

test("no major axe violations on demo results", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious, serious.map((item) => item.id).join(", ")).toEqual([]);
});
