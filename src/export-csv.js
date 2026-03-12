import { createObjectCsvWriter } from "csv-writer";
import { readFileSync, existsSync } from "fs";
import { ensureParentDir, isMainModule } from "./file-utils.js";

const CHANNELS_FILE = "output/channels.json";
const CSV_FILE = "output/influencers.csv";

export function buildCsvRecords(channels) {
  const records = channels.map((ch) => {
    const email =
      ch.emailFromAboutPage || ch.emailFromPublicSites || ch.emailFromDescription || "";
    let emailSource = "";
    if (ch.emailFromAboutPage) emailSource = "about_page";
    else if (ch.emailFromPublicSites) emailSource = "public_site";
    else if (ch.emailFromDescription) emailSource = "description";

    return {
      name: ch.name,
      category: ch.category,
      subscribers: ch.subscribers,
      url: ch.url,
      email,
      emailSource,
      description: ch.description?.replace(/[\n\r]+/g, " ").substring(0, 200),
    };
  });

  records.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return b.subscribers - a.subscribers;
  });

  return records;
}

export function summarizeCsvRecords(records) {
  const withEmail = records.filter((record) => record.email).length;
  const byCategory = {};

  for (const record of records) {
    if (!byCategory[record.category]) {
      byCategory[record.category] = { total: 0, withEmail: 0 };
    }
    byCategory[record.category].total++;
    if (record.email) {
      byCategory[record.category].withEmail++;
    }
  }

  return {
    total: records.length,
    withEmail,
    withoutEmail: records.length - withEmail,
    byCategory,
  };
}

export async function exportCsv() {
  if (!existsSync(CHANNELS_FILE)) {
    console.error(
      `No ${CHANNELS_FILE} found. Run "npm run discover" first.`
    );
    process.exit(1);
  }

  const channels = JSON.parse(readFileSync(CHANNELS_FILE, "utf-8"));

  const csvWriter = createObjectCsvWriter({
    path: CSV_FILE,
    header: [
      { id: "name", title: "Channel Name" },
      { id: "category", title: "Category" },
      { id: "subscribers", title: "Subscribers" },
      { id: "url", title: "Channel URL" },
      { id: "email", title: "Email" },
      { id: "emailSource", title: "Email Source" },
      { id: "description", title: "Description" },
    ],
  });

  const records = buildCsvRecords(channels);
  const summary = summarizeCsvRecords(records);

  ensureParentDir(CSV_FILE);
  await csvWriter.writeRecords(records);

  // Print summary
  console.log(`Exported ${records.length} channels to ${CSV_FILE}`);
  console.log(`  With email: ${summary.withEmail}`);
  console.log(`  Without email: ${summary.withoutEmail}`);

  console.log("\nBreakdown by category:");
  for (const [cat, info] of Object.entries(summary.byCategory)) {
    console.log(`  ${cat}: ${info.total} channels (${info.withEmail} with email)`);
  }
}

if (isMainModule(import.meta.url)) {
  exportCsv().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
