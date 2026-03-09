import { execSync } from "child_process";

const steps = [
  { script: "src/discover-channels.js", label: "Discovering channels via YouTube API" },
  { script: "src/collect-emails.js", label: "Collecting emails (browser - requires interaction)" },
  { script: "src/export-csv.js", label: "Exporting to CSV" },
];

console.log("YouTube Influencer Scraper");
console.log("=========================\n");

for (const step of steps) {
  console.log(`\n>>> ${step.label}...`);
  try {
    execSync(`node ${step.script}`, { stdio: "inherit" });
  } catch (err) {
    console.error(`Step failed: ${step.label}`);
    process.exit(1);
  }
}

console.log("\n=========================");
console.log("All done! Check output/influencers.csv for results.");
