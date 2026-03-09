import dotenv from "dotenv";
import { writeFileSync, existsSync, readFileSync } from "fs";

dotenv.config();

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error("Missing YOUTUBE_API_KEY in .env file. See .env.example");
  process.exit(1);
}

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const MIN_SUBSCRIBERS = 10_000;

// Search queries for each category
const CATEGORIES = {
  "video_game_reviewer": [
    "video game review",
    "video game reviewer",
    "gaming review channel",
    "game reviews",
    "indie game review",
    "PC game review",
    "console game review",
  ],
  "board_game_reviewer": [
    "board game review",
    "board game reviewer",
    "tabletop game review",
    "board game channel",
    "tabletop review",
  ],
  "tech_reviewer": [
    "tech review",
    "tech reviewer",
    "technology review channel",
    "gadget review",
    "tech unboxing",
    "smartphone review",
  ],
  "family_influencer": [
    "mom influencer",
    "dad influencer",
    "family vlog",
    "parenting channel",
    "kid friendly channel",
    "family YouTube channel",
    "mom vlog",
    "dad vlog",
  ],
};

async function apiGet(endpoint, params) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function searchChannels(query, maxPages = 3) {
  const channelIds = new Set();
  let pageToken = undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = {
      part: "snippet",
      q: query,
      type: "channel",
      maxResults: "50",
      order: "relevance",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await apiGet("search", params);

    for (const item of data.items || []) {
      if (item.snippet?.channelId) {
        channelIds.add(item.snippet.channelId);
      }
      if (item.id?.channelId) {
        channelIds.add(item.id.channelId);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;

    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  return [...channelIds];
}

async function getChannelDetails(channelIds) {
  const channels = [];

  // API allows max 50 IDs per request
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const data = await apiGet("channels", {
      part: "snippet,statistics,brandingSettings",
      id: batch.join(","),
    });

    for (const ch of data.items || []) {
      const subs = parseInt(ch.statistics?.subscriberCount || "0", 10);
      if (subs >= MIN_SUBSCRIBERS) {
        // Try to extract email from description
        const desc = ch.snippet?.description || "";
        const emailMatch = desc.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );

        channels.push({
          channelId: ch.id,
          name: ch.snippet?.title || "",
          url: `https://www.youtube.com/channel/${ch.id}`,
          subscribers: subs,
          description: desc.substring(0, 500),
          emailFromDescription: emailMatch ? emailMatch[0] : "",
          emailFromAboutPage: "", // Will be filled by collect-emails.js
        });
      }
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return channels;
}

async function main() {
  const outputPath = "output/channels.json";

  // Load existing data to avoid duplicates
  let existing = {};
  if (existsSync(outputPath)) {
    const data = JSON.parse(readFileSync(outputPath, "utf-8"));
    for (const ch of data) {
      existing[ch.channelId] = ch;
    }
    console.log(`Loaded ${Object.keys(existing).length} existing channels`);
  }

  for (const [category, queries] of Object.entries(CATEGORIES)) {
    console.log(`\n=== Searching category: ${category} ===`);

    for (const query of queries) {
      console.log(`  Searching: "${query}"`);
      try {
        const ids = await searchChannels(query, 3);
        console.log(`    Found ${ids.length} channel IDs`);

        const channels = await getChannelDetails(ids);
        console.log(
          `    ${channels.length} channels with ${MIN_SUBSCRIBERS.toLocaleString()}+ subscribers`
        );

        for (const ch of channels) {
          if (!existing[ch.channelId]) {
            ch.category = category;
            existing[ch.channelId] = ch;
          }
        }
      } catch (err) {
        console.error(`    Error: ${err.message}`);
      }
    }
  }

  const allChannels = Object.values(existing);
  writeFileSync(outputPath, JSON.stringify(allChannels, null, 2));
  console.log(`\nSaved ${allChannels.length} channels to ${outputPath}`);

  // Print summary
  const byCat = {};
  for (const ch of allChannels) {
    byCat[ch.category] = (byCat[ch.category] || 0) + 1;
  }
  console.log("\nSummary by category:");
  for (const [cat, count] of Object.entries(byCat)) {
    console.log(`  ${cat}: ${count}`);
  }

  const withEmail = allChannels.filter((c) => c.emailFromDescription).length;
  console.log(`\nChannels with email in description: ${withEmail}`);
  console.log(
    `Channels needing email collection via browser: ${allChannels.length - withEmail}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
