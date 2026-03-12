import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAboutPageEmails,
  extractEmails,
  extractUrls,
  isEmailConsistentWithSource,
  prioritizeUrls,
  selectRecentVideoEmailCandidate,
} from "../src/scrape-public-emails.js";

test("extractEmails decodes public contact formats and filters noise", () => {
  const text = `
    Contact: team&#64;creator.com
    Sales: sales [at] creator dot com
    <a href="/cdn-cgi/l/email-protection#127a777e7e7d5271607773667d603c717d7f">Email</a>
    support@google.com info@example.com jane-doe@xyz.edu
  `;

  assert.deepEqual(extractEmails(text).sort(), [
    "hello@creator.com",
    "sales@creator.com",
    "team@creator.com",
  ]);
});

test("extractAboutPageEmails reads visible text and mailto links", () => {
  const html = `
    <div>Business inquiries: booking@creator.com</div>
    <a href="mailto:hello@creator.com?subject=hi">Email us</a>
  `;

  assert.deepEqual(extractAboutPageEmails(html).sort(), [
    "booking@creator.com",
    "hello@creator.com",
  ]);
});

test("extractUrls resolves redirects and skips low-value links", () => {
  const text = [
    "https://www.youtube.com/redirect?q=https%3A%2F%2Fcreator.com%2Fcontact",
    "https:\\u002F\\u002Fbeacons.ai\\u002Fcreator",
    '<a href="/about">About</a>',
    '<a href="mailto:hello@creator.com">Mail</a>',
    "https://creator.com/privacy-policy",
    "https://creator.com/assets/logo.png",
  ].join(" ");

  assert.deepEqual(extractUrls(text, "https://creator.com"), [
    "https://creator.com/contact",
    "https://beacons.ai/creator",
    "https://creator.com/about",
  ]);
});

test("prioritizeUrls prefers link hubs and contact pages over generic or social links", () => {
  const urls = [
    "https://twitter.com/creator",
    "https://creator.com/",
    "https://creator.com/about",
    "https://beacons.ai/creator",
  ];

  const prioritized = prioritizeUrls(urls);

  assert.equal(prioritized[0], "https://beacons.ai/creator");
  assert.equal(prioritized.at(-1), "https://twitter.com/creator");
  assert.equal(prioritized.includes("https://creator.com/about"), true);
  assert.equal(prioritized.includes("https://creator.com/"), true);
});

test("isEmailConsistentWithSource rejects social and link hub sources", () => {
  assert.equal(
    isEmailConsistentWithSource(
      "hello@creator.com",
      "https://creator.com/contact",
      "Creator Channel"
    ),
    true
  );
  assert.equal(
    isEmailConsistentWithSource(
      "hello@creator.com",
      "https://linktr.ee/creator",
      "Creator Channel"
    ),
    false
  );
});

test("selectRecentVideoEmailCandidate prefers trusted-host matches", () => {
  const selected = selectRecentVideoEmailCandidate(
    [
      { email: "help@gmail.com", count: 3, links: [] },
      {
        email: "hello@creatorstudio.com",
        count: 1,
        links: ["https://creatorstudio.com/contact"],
      },
    ],
    ["creatorstudio.com"],
    "Creator Studio"
  );

  assert.equal(selected, "hello@creatorstudio.com");
});

test("selectRecentVideoEmailCandidate can fall back to channel-matching free email domains", () => {
  const selected = selectRecentVideoEmailCandidate(
    [{ email: "alicefamily@gmail.com", count: 1, links: [] }],
    [],
    "Alice Family"
  );

  assert.equal(selected, "alicefamily@gmail.com");
});
