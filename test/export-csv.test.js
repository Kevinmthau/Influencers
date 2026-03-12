import assert from "node:assert/strict";
import test from "node:test";

import { buildCsvRecords, summarizeCsvRecords } from "../src/export-csv.js";

test("buildCsvRecords sorts channels and applies email precedence", () => {
  const longDescription = `Line one\n${"x".repeat(220)}`;
  const records = buildCsvRecords([
    {
      name: "Tech Small",
      category: "tech_reviewer",
      subscribers: 50_000,
      url: "https://example.com/tech-small",
      emailFromPublicSites: "public@techsmall.com",
      description: "Short description",
    },
    {
      name: "Board Big",
      category: "board_game_reviewer",
      subscribers: 75_000,
      url: "https://example.com/board-big",
      emailFromDescription: "desc@boardbig.com",
      description: longDescription,
    },
    {
      name: "Tech Large",
      category: "tech_reviewer",
      subscribers: 150_000,
      url: "https://example.com/tech-large",
      emailFromAboutPage: "about@techlarge.com",
      emailFromPublicSites: "public@techlarge.com",
      emailFromDescription: "desc@techlarge.com",
      description: "Already clean",
    },
  ]);

  assert.deepEqual(
    records.map((record) => ({
      name: record.name,
      category: record.category,
      subscribers: record.subscribers,
      email: record.email,
      emailSource: record.emailSource,
    })),
    [
      {
        name: "Board Big",
        category: "board_game_reviewer",
        subscribers: 75_000,
        email: "desc@boardbig.com",
        emailSource: "description",
      },
      {
        name: "Tech Large",
        category: "tech_reviewer",
        subscribers: 150_000,
        email: "about@techlarge.com",
        emailSource: "about_page",
      },
      {
        name: "Tech Small",
        category: "tech_reviewer",
        subscribers: 50_000,
        email: "public@techsmall.com",
        emailSource: "public_site",
      },
    ]
  );

  assert.equal(records[0].description.includes("\n"), false);
  assert.equal(records[0].description.length, 200);
});

test("summarizeCsvRecords reports totals by category", () => {
  const summary = summarizeCsvRecords([
    {
      category: "board_game_reviewer",
      email: "first@example.net",
    },
    {
      category: "tech_reviewer",
      email: "",
    },
    {
      category: "tech_reviewer",
      email: "second@example.net",
    },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    withEmail: 2,
    withoutEmail: 1,
    byCategory: {
      board_game_reviewer: { total: 1, withEmail: 1 },
      tech_reviewer: { total: 2, withEmail: 1 },
    },
  });
});
