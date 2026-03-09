import { createObjectCsvWriter } from "csv-writer";
import { readFileSync, existsSync } from "fs";

const CHANNELS_FILE = "output/channels.json";
const CSV_FILE = "output/influencers.csv";

async function exportCsv() {
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

  const records = channels.map((ch) => {
    const email = ch.emailFromAboutPage || ch.emailFromPublicSites || ch.emailFromDescription || "";
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

  // Sort by category then subscribers descending
  records.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return b.subscribers - a.subscribers;
  });

  await csvWriter.writeRecords(records);

  // Print summary
  const withEmail = records.filter((r) => r.email).length;
  console.log(`Exported ${records.length} channels to ${CSV_FILE}`);
  console.log(`  With email: ${withEmail}`);
  console.log(`  Without email: ${records.length - withEmail}`);

  console.log("\nBreakdown by category:");
  const byCat = {};
  for (const r of records) {
    if (!byCat[r.category]) byCat[r.category] = { total: 0, withEmail: 0 };
    byCat[r.category].total++;
    if (r.email) byCat[r.category].withEmail++;
  }
  for (const [cat, info] of Object.entries(byCat)) {
    console.log(`  ${cat}: ${info.total} channels (${info.withEmail} with email)`);
  }
}

exportCsv().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
