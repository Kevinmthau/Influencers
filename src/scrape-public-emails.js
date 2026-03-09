import { readFileSync, writeFileSync, existsSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNELS_FILE = "output/channels.json";
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EXCLUDED_EMAILS = [
  "@youtube.com",
  "@google.com",
  "@example.com",
  "@email.com",
  "@domain.com",
  "@yourmail.com",
  "@gmail.con",
  "noreply@",
  "no-reply@",
  "support@google",
];

function isValidEmail(email) {
  const lower = email.toLowerCase();
  return !EXCLUDED_EMAILS.some((ex) => lower.includes(ex));
}

function extractEmails(text) {
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches.filter(isValidEmail))];
}

async function fetchPage(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getChannelLinks(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&id=${channelId}&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const channel = data.items?.[0];
    if (!channel) return [];

    const links = [];

    // Extract links from channel description
    const desc = channel.snippet?.description || "";
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
    const descLinks = desc.match(urlRegex) || [];
    links.push(...descLinks);

    // Extract custom links from branding settings
    const brandingLinks =
      channel.brandingSettings?.channel?.featuredChannelsUrls || [];
    links.push(...brandingLinks);

    return links;
  } catch {
    return [];
  }
}

async function scrapeLinktree(url) {
  const html = await fetchPage(url);
  if (!html) return [];

  const emails = extractEmails(html);

  // Linktree pages sometimes have links to other pages with emails
  const linkMatches = html.match(/href="(https?:\/\/[^"]+)"/g) || [];
  const externalLinks = linkMatches
    .map((m) => m.replace('href="', "").replace('"', ""))
    .filter(
      (l) =>
        !l.includes("linktr.ee") &&
        !l.includes("facebook.com") &&
        !l.includes("twitter.com") &&
        !l.includes("instagram.com") &&
        !l.includes("tiktok.com") &&
        !l.includes("youtube.com")
    )
    .slice(0, 3); // limit to avoid too many requests

  return emails;
}

async function scrapeWebsite(url) {
  const html = await fetchPage(url);
  if (!html) return [];
  return extractEmails(html);
}

async function scrapeSocialBio(url) {
  // For social media, just try to fetch the page and find emails in the bio
  const html = await fetchPage(url);
  if (!html) return [];
  return extractEmails(html);
}

async function processChannel(channel) {
  if (channel.emailFromDescription || channel.emailFromAboutPage || channel.emailFromPublicSites) {
    return null; // already has email
  }

  const foundEmails = [];

  // 1. Get links from YouTube channel page via API
  const links = await getChannelLinks(channel.channelId);

  // 2. Also parse links from the description we already have
  const descLinks =
    channel.description?.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  const allLinks = [...new Set([...links, ...descLinks])];

  console.log(`    Found ${allLinks.length} links to check`);

  for (const link of allLinks) {
    const lower = link.toLowerCase();

    try {
      let emails = [];

      if (lower.includes("linktr.ee") || lower.includes("linktree")) {
        emails = await scrapeLinktree(link);
      } else if (
        lower.includes("twitter.com") ||
        lower.includes("x.com") ||
        lower.includes("instagram.com") ||
        lower.includes("tiktok.com") ||
        lower.includes("facebook.com")
      ) {
        emails = await scrapeSocialBio(link);
      } else if (
        !lower.includes("youtube.com") &&
        !lower.includes("youtu.be")
      ) {
        // Personal website or other link
        emails = await scrapeWebsite(link);

        // Also try /contact, /about, /contact-us pages
        if (emails.length === 0) {
          const base = new URL(link).origin;
          for (const path of ["/contact", "/about", "/contact-us"]) {
            const pageEmails = await scrapeWebsite(base + path);
            emails.push(...pageEmails);
            if (emails.length > 0) break;
          }
        }
      }

      if (emails.length > 0) {
        foundEmails.push(...emails);
        console.log(`    Found email(s) from ${link}: ${emails.join(", ")}`);
      }
    } catch {
      // skip failed links
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 500));
  }

  if (foundEmails.length > 0) {
    return [...new Set(foundEmails)][0]; // return first unique email
  }

  return null;
}

async function main() {
  if (!existsSync(CHANNELS_FILE)) {
    console.error(`No ${CHANNELS_FILE} found. Run "npm run discover" first.`);
    process.exit(1);
  }

  const channels = JSON.parse(readFileSync(CHANNELS_FILE, "utf-8"));

  const needEmail = channels.filter(
    (ch) => !ch.emailFromDescription && !ch.emailFromAboutPage && !ch.emailFromPublicSites
  );

  console.log(
    `Checking public sites for ${needEmail.length} channels without emails (${channels.length} total)\n`
  );

  let found = 0;

  for (let i = 0; i < needEmail.length; i++) {
    const ch = needEmail[i];
    console.log(
      `[${i + 1}/${needEmail.length}] ${ch.name} (${ch.subscribers.toLocaleString()} subs)`
    );

    const email = await processChannel(ch);

    if (email) {
      const idx = channels.findIndex((c) => c.channelId === ch.channelId);
      if (idx !== -1) {
        channels[idx].emailFromPublicSites = email;
      }
      found++;
    }

    // Save progress every 10 channels
    if ((i + 1) % 10 === 0) {
      writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
    }
  }

  // Final save
  writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));

  const totalWithEmail = channels.filter(
    (c) => c.emailFromDescription || c.emailFromAboutPage || c.emailFromPublicSites
  ).length;

  console.log(`\nDone! Found ${found} new emails from public sites.`);
  console.log(`Total channels with email: ${totalWithEmail}/${channels.length}`);
  console.log(
    `Remaining for CAPTCHA-based collection: ${channels.length - totalWithEmail}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
