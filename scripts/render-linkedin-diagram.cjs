const path = require("node:path");

async function main() {
  // Use Playwright if available via npx. We require it so this script
  // can be invoked after `npx playwright install chromium`.
  const { chromium } = require("playwright");

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });

  const filePath = path.resolve(__dirname, "..", "linkedin-diagram.html");
  await page.goto(`file://${filePath}`, { waitUntil: "load" });
  await page.waitForTimeout(250);

  const outPath = path.resolve(__dirname, "..", "yapass-architecture-linkedin.png");
  await page.screenshot({ path: outPath, fullPage: false });
  await browser.close();
  console.log("wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

