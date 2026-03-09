import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";

const CHANNELS_FILE = "output/channels.json";
const TIMEOUT_FOR_CAPTCHA = 120_000; // 2 minutes for user to solve CAPTCHA

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

  let collected = 0;
  let skipped = 0;

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

      // Wait for page to settle
      await page.waitForTimeout(2000);

      // Look for the "View email address" button
      // YouTube uses different selectors depending on the layout
      const emailButton = await page.$(
        [
          // Modern YouTube layout selectors
          'button:has-text("View email address")',
          'a:has-text("View email address")',
          "#view-email-button",
          'yt-button-renderer:has-text("View email")',
          'button:has-text("view email")',
          // Channel page "Details" section
          'tp-yt-paper-button:has-text("View email address")',
        ].join(", ")
      );

      if (!emailButton) {
        console.log("  No 'View email address' button found. Skipping.");
        skipped++;
        continue;
      }

      // Click the button
      console.log("  Clicking 'View email address' button...");
      await emailButton.click();

      // Wait for the CAPTCHA / verification to appear
      await page.waitForTimeout(1500);

      // Alert the user
      console.log(
        "  >>> COMPLETE THE CAPTCHA IN THE BROWSER WINDOW <<<"
      );
      console.log(
        `  Waiting up to ${TIMEOUT_FOR_CAPTCHA / 1000}s for you to complete it...`
      );

      // Wait for the email to appear on the page after CAPTCHA completion
      // The email typically appears in a specific element after verification
      const email = await waitForEmail(page, TIMEOUT_FOR_CAPTCHA);

      if (email) {
        console.log(`  Email found: ${email}`);
        // Update the channel record
        const idx = channels.findIndex((c) => c.channelId === ch.channelId);
        if (idx !== -1) {
          channels[idx].emailFromAboutPage = email;
        }
        collected++;

        // Save progress after each successful collection
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

  await browser.close();

  console.log(`\nDone! Collected: ${collected}, Skipped: ${skipped}`);
  console.log(`Results saved to ${CHANNELS_FILE}`);
}

async function waitForEmail(page, timeout) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Try multiple selectors where YouTube displays the email after CAPTCHA
    const selectors = [
      // The email link that appears after verification
      'a[href^="mailto:"]',
      // Text content that looks like an email
      "#email",
      ".email-text",
      // Generic approach: look for email pattern in visible text
    ];

    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const text = await el.textContent();
          const emailMatch = text?.match(
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
          );
          if (emailMatch) return emailMatch[0];

          // For mailto links
          const href = await el.getAttribute("href");
          if (href?.startsWith("mailto:")) {
            return href.replace("mailto:", "").split("?")[0];
          }
        }
      } catch {
        // Selector not found, continue
      }
    }

    // Fallback: scan visible page text for email patterns
    try {
      const bodyText = await page.evaluate(() => document.body.innerText);
      // Look for email that appeared after clicking the button
      // Filter out common false positives
      const emails = bodyText.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      );
      if (emails) {
        // Return the first email that isn't a YouTube/Google system email
        const validEmail = emails.find(
          (e) =>
            !e.includes("@youtube.com") &&
            !e.includes("@google.com") &&
            !e.includes("example.com")
        );
        if (validEmail) return validEmail;
      }
    } catch {
      // Page might be navigating
    }

    await page.waitForTimeout(2000);
  }

  return null;
}

collectEmails().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
