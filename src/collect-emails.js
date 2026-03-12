import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { ensureParentDir } from "./file-utils.js";

const CHANNELS_FILE = "output/channels.json";
const EMAIL_CAPTURE_TIMEOUT = 10_000;
const PAGE_RENDER_TIMEOUT = 10_000;
const EMAIL_TEXT_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

async function collectEmails() {
  if (!existsSync(CHANNELS_FILE)) {
    console.error(
      `No ${CHANNELS_FILE} found. Run "npm run discover" first.`
    );
    process.exit(1);
  }

  const channels = JSON.parse(readFileSync(CHANNELS_FILE, "utf-8"));

  // Filter to channels that still need email collection
  const needEmail = channels.filter(
    (ch) => !ch.emailFromAboutPage && !ch.emailFromPublicSites && !ch.emailFromDescription
  );
  console.log(
    `${needEmail.length} channels need email collection (${channels.length} total)`
  );

  if (needEmail.length === 0) {
    console.log("All channels already have emails. Nothing to do.");
    return;
  }

  // Launch browser in headed mode so user can interact with CAPTCHAs
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const readline = createInterface({ input, output });

  let collected = 0;
  let skipped = 0;
  let aborted = false;

  for (let i = 0; i < needEmail.length; i++) {
    const ch = needEmail[i];
    console.log(
      `\n[${i + 1}/${needEmail.length}] ${ch.name} (${ch.subscribers.toLocaleString()} subs)`
    );
    console.log(`  ${ch.url}`);

    try {
      // Navigate to the channel's "about" page
      const aboutUrl = `${ch.url}/about`;
      await page.goto(aboutUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      // Give YouTube's About page time to render the business inquiry section.
      await page.waitForLoadState("networkidle", { timeout: PAGE_RENDER_TIMEOUT }).catch(() => {});
      await page.waitForTimeout(2_000);

      const result = await handleCurrentPage(readline, page);

      if (result.action === "quit") {
        console.log("  Stopping at your request.");
        aborted = true;
        break;
      }

      if (result.action === "skip") {
        console.log("  Skipped.");
        skipped++;
        continue;
      }

      if (result.email) {
        const email = result.email;
        console.log(`  Email found: ${email}`);
        // Update the channel record
        const idx = channels.findIndex((c) => c.channelId === ch.channelId);
        if (idx !== -1) {
          channels[idx].emailFromAboutPage = email;
        }
        collected++;

        // Save progress after each successful collection
        ensureParentDir(CHANNELS_FILE);
        writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
      } else {
        console.log("  Could not extract email. Skipping.");
        skipped++;
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      skipped++;
    }

    // Small delay between channels
    await page.waitForTimeout(1000);
  }

  readline.close();
  await browser.close();

  console.log(`\nDone! Collected: ${collected}, Skipped: ${skipped}`);
  if (aborted) {
    console.log("Run `npm run collect-emails` again to continue where you left off.");
  }
  console.log(`Results saved to ${CHANNELS_FILE}`);
}

async function findEmailButton(page, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
  const candidates = [
    page.getByRole("button", { name: /view email/i }).first(),
    page.getByRole("link", { name: /view email/i }).first(),
    page.getByText(/view email address/i).first(),
    page.getByText(/view email/i).first(),
    page.locator("#view-email-button").first(),
    page.locator("yt-button-view-model").filter({ hasText: /view email/i }).first(),
    page.locator("button-view-model").filter({ hasText: /view email/i }).first(),
    page.locator("tp-yt-paper-button").filter({ hasText: /view email/i }).first(),
    page.locator("yt-button-renderer").filter({ hasText: /view email/i }).first(),
  ];

    for (const locator of candidates) {
      try {
        if (await locator.isVisible({ timeout: 1_000 })) {
          return locator;
        }
      } catch {
        // Try the next candidate.
      }
    }

    await page.waitForTimeout(1_000);
  }

  return null;
}

async function handleCurrentPage(readline, page) {
  while (true) {
    console.log("  >>> Use the browser window now. This page will stay open until you choose what to do. <<<");
    const answer = await readline.question(
      "  Press Enter after the email is visible. Type 'auto' for me to click 'View email', paste the email directly, 'skip' for next channel, or 'quit' to stop: "
    );
    const trimmed = answer.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "skip") {
      return { action: "skip", email: null };
    }

    if (lower === "quit") {
      return { action: "quit", email: null };
    }

    const manualEmailMatch = trimmed.match(EMAIL_TEXT_REGEX);
    if (manualEmailMatch) {
      return { action: "captured", email: manualEmailMatch[0] };
    }

    if (lower === "auto") {
      const emailButton = await findEmailButton(page, PAGE_RENDER_TIMEOUT);
      if (!emailButton) {
        console.log(
          "  I couldn't find a 'View email' button automatically. You can keep working manually on this page."
        );
        continue;
      }

      console.log("  Clicking 'View email address' button...");
      await emailButton.click({ timeout: 5_000 });
      await page.waitForTimeout(1500);
      console.log("  Solve the CAPTCHA in the browser, then press Enter here once the email is visible.");
      continue;
    }

    const email = await waitForEmail(page, EMAIL_CAPTURE_TIMEOUT);
    if (email) {
      return { action: "captured", email };
    }

    console.log(
      "  Email still isn't visible to the script. Keep working in the browser, type 'auto' for a click attempt, paste the email directly, or 'skip'."
    );
  }
}

async function waitForEmail(page, timeout) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (const frame of page.frames()) {
      const email = await extractEmailFromFrame(frame);
      if (email) {
        return email;
      }
    }

    await page.waitForTimeout(1_000);
  }

  return null;
}

async function extractEmailFromFrame(frame) {
  try {
    const mailto = frame.locator('a[href^="mailto:"]').first();
    const href = await mailto.getAttribute("href", { timeout: 1_000 });
    if (href?.startsWith("mailto:")) {
      return href.replace("mailto:", "").split("?")[0];
    }
  } catch {
    // Ignore missing mailto links.
  }

  try {
    const bodyText = await frame.evaluate(() => document.body?.innerText || "");
    const emails = bodyText.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    );

    if (emails) {
      return emails.find(
        (email) =>
          !email.includes("@youtube.com") &&
          !email.includes("@google.com") &&
          !email.includes("example.com")
      );
    }
  } catch {
    // The frame might still be loading.
  }

  return null;
}

collectEmails().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
