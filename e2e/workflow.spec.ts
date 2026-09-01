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
  await expect(page.getByText("Researcher classification", { exact: true })).toBeVisible();
  await workflowStep(page, "Review").click();
  await expect(page.getByRole("tab", { name: /Issues/ })).toBeVisible();
  await page.getByRole("tab", { name: /Events/ }).click();
  await expect(page.getByRole("heading", { name: "All events", exact: true })).toBeVisible();
  await workflowStep(page, "Results").click();
  await expect(page.getByText("Primary latency", { exact: true })).toBeVisible();
  const pathBefore = await page.locator(".metric").filter({ hasText: "Path length" }).locator("dd").innerText();

  await workflowStep(page, "Review").click();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Correct body" }).click();
  await page.getByRole("button", { name: "Mark hidden in hole" }).click();
  await expect(page.getByText("Manual correction at 0.0 s.", { exact: true })).toBeVisible({ timeout: 10_000 });

  await workflowStep(page, "Results").click();
  const pathAfter = await page.locator(".metric").filter({ hasText: "Path length" }).locator("dd").innerText();
  expect(pathAfter, "a tracking correction must recompute metrics").not.toEqual(pathBefore);

  await page.reload();
  await workflowStep(page, "Review").click();
  await expect(page.getByText("Manual correction at 0.0 s.", { exact: true })).toBeVisible();
  await expect(page.getByText(/t = 0\.000 s · hidden · manual/)).toBeVisible();

  await workflowStep(page, "Results").click();
  await page.getByText("Method / Analysis settings", { exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Videos", exact: true })).toBeVisible();
});

test("trial removal persists after reload", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(page.getByText("Example analysis", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trial actions for test53.mp4" }).click();
  await page.getByRole("menuitem", { name: "Remove from session" }).click();
  await expect(page.getByRole("heading", { name: /Remove test53\.mp4 from this session/ })).toBeVisible();
  await page.getByRole("button", { name: "Remove trial" }).click();
  await expect(page.getByRole("button", { name: "Trial actions for test53.mp4" })).toHaveCount(0);
  await expect(page.getByText("✓ Saved locally")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Example analysis", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trial actions for test53.mp4" })).toHaveCount(0);
  await expect(page.getByText("test50.mp4").first()).toBeVisible();
});

test("trial groups persist after reload", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  page.once("dialog", (dialog) => void dialog.accept("Day 1"));
  await page.getByRole("button", { name: "Add to session" }).click();
  await page.getByRole("menuitem", { name: "New group" }).click();
  await expect(page.getByRole("button", { name: /Day 1/ })).toBeVisible();
  await page.getByRole("button", { name: "Trial actions for test50.mp4" }).click();
  await page.getByRole("menuitem", { name: "Move to Day 1" }).click();
  await expect(page.getByText("✓ Saved locally")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Day 1/ })).toBeVisible();
});

test("arena treats zero diameter as uncalibrated", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await workflowStep(page, "Arena").click();
  await expect(page.getByText("Physical scale")).toBeVisible();
  await expect(page.getByText(/Arena calibrated/)).toBeVisible();
  await page.getByLabel("Platform diameter (cm)").fill("0");
  await page.getByLabel("Platform diameter (cm)").blur();
  await expect(page.getByText(/Geometry ready/)).toBeVisible();
  await expect(page.getByText(/Physical scale required/)).toBeVisible();
  await workflowStep(page, "Results").click();
  await expect(page.getByRole("button", { name: "Set diameter" }).first()).toBeVisible();
});

test("no major axe violations on demo results", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious, serious.map((item) => item.id).join(", ")).toEqual([]);
});
