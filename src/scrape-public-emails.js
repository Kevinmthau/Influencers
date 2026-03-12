import { readFileSync, writeFileSync, existsSync } from "fs";
import dotenv from "dotenv";
import { ensureParentDir } from "./file-utils.js";

dotenv.config();

const API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const BASE_URL = "https://www.googleapis.com/youtube/v3";
const CHANNELS_FILE = "output/channels.json";
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const DIRECT_URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;
const ESCAPED_URL_REGEX = /https?:\\u002F\\u002F[^"'\\\s<>)\]]+/g;
const HREF_REGEX = /href=["']([^"'#]+)["']/gi;
const YOUTUBE_REDIRECT_REGEX = /(?:https:\/\/www\.youtube\.com)?\/redirect\?[^"'\\\s<>)\]]+/gi;
const GENERIC_TOKENS = new Set([
  "www",
  "http",
  "https",
  "com",
  "net",
  "org",
  "co",
  "io",
  "tv",
  "gg",
  "at",
  "ca",
  "uk",
  "vn",
  "me",
  "page",
  "app",
  "dev",
]);
const MAX_RECENT_VIDEOS = 12;
const MAX_LINKS_PER_CHANNEL = 20;
const MAX_SITEMAP_URLS = 8;
const PAGE_TIMEOUT = 12_000;
const REQUEST_DELAY_MS = 250;
const SAVE_EVERY = 5;
const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/page-sitemap.xml",
  "/post-sitemap.xml",
  "/sitemap-index.xml",
];
const EXCLUDED_EMAIL_PATTERNS = [
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
  "u003",
  "downloads_",
  "@2x.",
  "jane-doe@",
  "@xyz.edu",
  "@store.com",
];
const EXCLUDED_EMAIL_DOMAINS = [
  "youtube.com",
  "google.com",
  "example.com",
  "patreon.com",
  "store.com",
  "sentry.io",
  "wixpress.com",
  "amazon.com",
  "amazonaws.com",
  "mailchimp.com",
  "mailchimpapp.net",
  "shopify.com",
  "facebook.com",
  "facebookmail.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
];
const EXCLUDED_EMAIL_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
  ".css",
  ".js",
  ".woff",
  ".woff2",
  ".ttf",
  ".map",
];
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];
const LINK_HUB_HOSTS = [
  "linktr.ee",
  "beacons.ai",
  "bio.site",
  "withkoji.com",
  "koji.to",
  "stan.store",
  "carrd.co",
  "bento.me",
  "lnk.bio",
  "linkpop.com",
  "direct.me",
  "flow.page",
  "solo.to",
  "hoo.be",
  "pillar.io",
  "taplink.cc",
  "contactin.bio",
  "snipfeed.co",
  "fourthwall.com",
  "throne.com",
];
const PROFILE_PLATFORM_HOSTS = [
  "artstation.com",
  "bandcamp.com",
  "blogspot.com",
  "buymeacoffee.com",
  "deviantart.com",
  "itch.io",
  "ko-fi.com",
  "medium.com",
  "pinterest.com",
  "reddit.com",
  "soundcloud.com",
  "substack.com",
  "tumblr.com",
  "wordpress.com",
];
const SOCIAL_HOSTS = [
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "threads.net",
  "linkedin.com",
  "twitch.tv",
];
const SKIPPED_LINK_HOSTS = [
  "youtube.com",
  "youtu.be",
  "google.com",
  "enable-javascript.com",
  "patreon.com",
  "discord.gg",
  "discord.com",
  "spotify.com",
  "open.spotify.com",
  "music.apple.com",
  "apps.apple.com",
  "schema.org",
  "www.w3.org",
  "w3.org",
  "ogp.me",
  "ytimg.com",
  "i.ytimg.com",
  "ggpht.com",
  "gstatic.com",
  "googleusercontent.com",
  "doubleclick.net",
  "googlesyndication.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];
const SHORTENER_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "buff.ly",
  "ow.ly",
  "t.co",
  "lnk.to",
];
const FREE_EMAIL_HOSTS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "gmx.com",
];
const SKIPPED_URL_PATH_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
  ".css",
  ".js",
  ".woff",
  ".woff2",
  ".ttf",
  ".map",
  ".mp4",
  ".mp3",
  ".webm",
  ".mov",
  ".pdf",
  ".zip",
];
const SKIPPED_URL_PATH_HINTS = [
  "agreement",
  "cookie",
  "legal",
  "policy",
  "privacy",
  "refund",
  "returns",
  "shipping",
  "terms",
];
const COMMON_CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contacto",
  "/contato",
  "/contactez-nous",
  "/get-in-touch",
  "/about",
  "/about-us",
  "/about-me",
  "/bio",
  "/team",
  "/connect",
  "/business",
  "/business-inquiries",
  "/business-enquiries",
  "/press",
  "/presskit",
  "/press-kit",
  "/press-kit-download",
  "/sponsorship",
  "/media-kit",
  "/mediakit",
  "/media",
  "/sponsor",
  "/sponsors",
  "/partner",
  "/partnerships",
  "/advertise",
  "/advertising",
  "/work-with-me",
  "/booking",
  "/bookings",
  "/book-me",
  "/collab",
  "/collaborate",
  "/brand",
  "/brands",
  "/inquiries",
  "/kontakt",
  "/impressum",
];
const CONTACT_HINTS = [
  "contact",
  "contacto",
  "contato",
  "contactez",
  "touch",
  "about",
  "business",
  "inquir",
  "press",
  "presskit",
  "media",
  "sponsor",
  "partner",
  "advertis",
  "booking",
  "book",
  "collab",
  "brand",
  "work-with",
  "bio",
  "connect",
  "kontakt",
  "impressum",
  "creator",
];
const HTML_NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const OBFUSCATED_AT_PATTERN =
  String.raw`(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|\bat\b)`;
const OBFUSCATED_DOT_PATTERN = String.raw`(?:\[\s*(?:dot|period|punto|punkt)\s*\]|\(\s*(?:dot|period|punto|punkt)\s*\)|\{\s*(?:dot|period|punto|punkt)\s*\}|\b(?:dot|period|punto|punkt)\b)`;
const OBFUSCATED_EMAIL_REGEX = new RegExp(
  String.raw`\b([a-z0-9][a-z0-9._%+\-]{0,63})\s*${OBFUSCATED_AT_PATTERN}\s*([a-z0-9][a-z0-9\-]*(?:\s*${OBFUSCATED_DOT_PATTERN}\s*[a-z0-9][a-z0-9\-]*)+)\b`,
  "gi"
);
const CONTACT_EMAIL_HINTS = [
  "biz",
  "book",
  "brand",
  "business",
  "collab",
  "contact",
  "hello",
  "inquir",
  "management",
  "media",
  "partner",
  "press",
  "sponsor",
  "team",
  "work",
];
const NON_CONTACT_EMAIL_HINTS = [
  "account",
  "customer",
  "help",
  "legal",
  "licens",
  "music",
  "order",
  "privacy",
  "recovery",
  "rights",
  "service",
  "store",
  "support",
];

const sitemapCache = new Map();

if (!API_KEY || API_KEY === "your_api_key_here") {
  console.error("Missing YOUTUBE_API_KEY in .env file. See .env.example");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(endpoint, params) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("key", API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${text}`);
  }
  return res.json();
}

function normalizeEmail(email) {
  return email
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^(?:u[0-9a-f]{4})+/i, "")
    .replace(/[<>"'),.;:]+$/g, "");
}

function isValidEmail(email) {
  const lower = normalizeEmail(email).toLowerCase();
  const [local = "", domain = ""] = lower.split("@");

  if (!local || !domain || !domain.includes(".")) {
    return false;
  }

  if (lower.includes("/") || lower.includes("\\")) {
    return false;
  }

  if (domain.includes("sentry")) {
    return false;
  }

  if (EXCLUDED_EMAIL_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return false;
  }

  if (EXCLUDED_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return false;
  }

  if (
    EXCLUDED_EMAIL_DOMAINS.some(
      (blocked) => domain === blocked || domain.endsWith(`.${blocked}`)
    )
  ) {
    return false;
  }

  return true;
}

function extractEmails(text) {
  if (!text) {
    return [];
  }

  const decodedText = decodeHtmlEntities(text);
  const directMatches = decodedText.match(EMAIL_REGEX) || [];
  const obfuscatedMatches = extractObfuscatedEmails(decodedText);
  const cloudflareMatches = extractCloudflareEmails(text);

  return [
    ...new Set(
      [...directMatches, ...obfuscatedMatches, ...cloudflareMatches]
        .map(normalizeEmail)
        .filter(isValidEmail)
    ),
  ];
}

function getEmailDomain(email) {
  return normalizeEmail(email).toLowerCase().split("@")[1] || "";
}

function getEmailLocalPart(email) {
  return normalizeEmail(email).toLowerCase().split("@")[0] || "";
}

function emailMatchesHost(email, url) {
  const emailDomain = getEmailDomain(email);
  const hostname = new URL(url).hostname.toLowerCase();

  return (
    emailDomain === hostname ||
    emailDomain.endsWith(`.${hostname}`) ||
    hostname.endsWith(`.${emailDomain}`)
  );
}

function tokenizeText(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token));
}

function hasTokenOverlap(left, right) {
  return left.some((leftToken) =>
    right.some(
      (rightToken) =>
        leftToken === rightToken ||
        leftToken.includes(rightToken) ||
        rightToken.includes(leftToken)
    )
  );
}

function isEmailConsistentWithSource(email, sourceUrl, channelName) {
  if (!sourceUrl?.startsWith("http")) {
    return true;
  }

  const hostname = new URL(sourceUrl).hostname.toLowerCase();
  if (
    hostnameMatches(hostname, LINK_HUB_HOSTS) ||
    hostnameMatches(hostname, PROFILE_PLATFORM_HOSTS) ||
    hostnameMatches(hostname, SOCIAL_HOSTS)
  ) {
    return false;
  }

  if (hostnameMatches(hostname, SHORTENER_HOSTS)) {
    return false;
  }

  if (emailMatchesHost(email, sourceUrl)) {
    return true;
  }

  const emailTokens = tokenizeText(normalizeEmail(email).replace("@", " "));
  const sourceTokens = [
    ...tokenizeText(hostname.replace(/^www\./, "")),
    ...tokenizeText(new URL(sourceUrl).pathname),
  ];
  const channelTokens = tokenizeText(channelName);

  return (
    hasTokenOverlap(emailTokens, sourceTokens) ||
    hasTokenOverlap(emailTokens, channelTokens)
  );
}

function hostnameMatches(hostname, candidates) {
  return candidates.some(
    (candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`)
  );
}

function isLinkHubUrl(url) {
  return hostnameMatches(new URL(url).hostname.toLowerCase(), LINK_HUB_HOSTS);
}

function isSocialUrl(url) {
  return hostnameMatches(new URL(url).hostname.toLowerCase(), SOCIAL_HOSTS);
}

function isProfilePlatformUrl(url) {
  return hostnameMatches(
    new URL(url).hostname.toLowerCase(),
    PROFILE_PLATFORM_HOSTS
  );
}

function isSkippedLink(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  return hostnameMatches(hostname, SKIPPED_LINK_HOSTS);
}

function decodeUrlCandidate(candidate) {
  return candidate
    .trim()
    .replace(/^['"(]+/, "")
    .replace(/['"),.;]+$/, "")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");
}

function decodeHtmlEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = parseInt(normalized.slice(2), 16);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    if (normalized.startsWith("#")) {
      const codePoint = parseInt(normalized.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    return HTML_NAMED_ENTITIES[normalized] || match;
  });
}

function decodeCloudflareEmail(encoded) {
  if (!encoded || encoded.length < 4 || encoded.length % 2 !== 0) {
    return "";
  }

  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    let email = "";

    for (let i = 2; i < encoded.length; i += 2) {
      const value = parseInt(encoded.slice(i, i + 2), 16);
      email += String.fromCharCode(value ^ key);
    }

    return normalizeEmail(email);
  } catch {
    return "";
  }
}

function extractCloudflareEmails(text) {
  if (!text) {
    return [];
  }

  const encoded = [
    ...text.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi),
    ...text.matchAll(/email-protection#([0-9a-f]+)/gi),
  ].map((match) => match[1]);

  return [...new Set(encoded.map(decodeCloudflareEmail).filter(isValidEmail))];
}

function extractObfuscatedEmails(text) {
  if (!text) {
    return [];
  }

  const emails = [];
  for (const match of text.matchAll(OBFUSCATED_EMAIL_REGEX)) {
    const local = match[1];
    const domain = match[2]
      .replace(new RegExp(OBFUSCATED_DOT_PATTERN, "gi"), ".")
      .replace(/\s+/g, "");

    emails.push(`${local}@${domain}`);
  }

  return [...new Set(emails.map(normalizeEmail).filter(isValidEmail))];
}

function normalizeUrlCandidate(candidate, baseUrl) {
  let decoded = decodeUrlCandidate(candidate);
  if (!decoded) {
    return null;
  }

  if (decoded.startsWith("//")) {
    decoded = `https:${decoded}`;
  }

  let url;
  try {
    url = baseUrl ? new URL(decoded, baseUrl) : new URL(decoded);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostnameMatches(hostname, YOUTUBE_HOSTS)) {
    if (url.pathname.includes("/redirect")) {
      const redirectTarget = url.searchParams.get("q") || url.searchParams.get("url");
      return redirectTarget ? normalizeUrlCandidate(redirectTarget) : null;
    }
    return null;
  }

  url.hash = "";
  if (
    SKIPPED_URL_PATH_SUFFIXES.some((suffix) =>
      url.pathname.toLowerCase().endsWith(suffix)
    )
  ) {
    return null;
  }

  const pathWithQuery = `${url.pathname}${url.search}`.toLowerCase();
  if (SKIPPED_URL_PATH_HINTS.some((hint) => pathWithQuery.includes(hint))) {
    return null;
  }

  const normalized = url.toString().replace(/[),.;]+$/, "");

  try {
    if (isSkippedLink(normalized)) {
      return null;
    }
  } catch {
    return null;
  }

  return normalized;
}

function extractUrls(text, baseUrl) {
  if (!text) {
    return [];
  }

  const candidates = [
    ...(text.match(DIRECT_URL_REGEX) || []),
    ...(text.match(ESCAPED_URL_REGEX) || []),
  ];

  HREF_REGEX.lastIndex = 0;
  let hrefMatch = HREF_REGEX.exec(text);
  while (hrefMatch) {
    candidates.push(hrefMatch[1]);
    hrefMatch = HREF_REGEX.exec(text);
  }

  return [
    ...new Set(
      candidates
        .map((candidate) => normalizeUrlCandidate(candidate, baseUrl))
        .filter(Boolean)
    ),
  ];
}

function extractYoutubeAboutLinks(text, baseUrl) {
  if (!text) {
    return [];
  }

  const candidates = [];

  HREF_REGEX.lastIndex = 0;
  let hrefMatch = HREF_REGEX.exec(text);
  while (hrefMatch) {
    candidates.push(hrefMatch[1]);
    hrefMatch = HREF_REGEX.exec(text);
  }

  YOUTUBE_REDIRECT_REGEX.lastIndex = 0;
  let redirectMatch = YOUTUBE_REDIRECT_REGEX.exec(text);
  while (redirectMatch) {
    candidates.push(redirectMatch[0]);
    redirectMatch = YOUTUBE_REDIRECT_REGEX.exec(text);
  }

  return prioritizeUrls(
    candidates
      .map((candidate) => normalizeUrlCandidate(candidate, baseUrl))
      .filter(Boolean)
  );
}

function stripHtmlToText(html) {
  return decodeHtmlEntities(
    html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  );
}

function extractAboutPageEmails(html) {
  const visibleTextEmails = extractEmails(stripHtmlToText(html));
  const mailtoEmails = extractEmails(
    [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((match) => match[1]).join(" ")
  );

  return [...new Set([...visibleTextEmails, ...mailtoEmails])];
}

function rankUrl(url) {
  const parsed = new URL(url);
  const composite = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  let score = 0;

  if (isLinkHubUrl(url)) score += 40;
  if (!isSocialUrl(url)) score += 20;
  if (CONTACT_HINTS.some((hint) => composite.includes(hint))) score += 20;
  if (parsed.pathname === "/" || parsed.pathname === "") score += 5;

  return score;
}

function prioritizeUrls(urls) {
  return [...new Set(urls)].sort((left, right) => rankUrl(right) - rankUrl(left));
}

function matchesTrustedHost(hostname, trustedHosts) {
  for (const trustedHost of trustedHosts) {
    if (
      hostname === trustedHost ||
      hostname.endsWith(`.${trustedHost}`) ||
      trustedHost.endsWith(`.${hostname}`)
    ) {
      return true;
    }
  }

  return false;
}

function emailHasHint(email, hints) {
  const local = getEmailLocalPart(email);
  return hints.some((hint) => local.includes(hint));
}

function isFreeEmailDomain(email) {
  const domain = getEmailDomain(email);
  return FREE_EMAIL_HOSTS.some(
    (host) => domain === host || domain.endsWith(`.${host}`)
  );
}

function emailMatchesKnownHosts(email, urlsOrHosts) {
  const emailDomain = getEmailDomain(email);

  return urlsOrHosts.some((value) => {
    try {
      const hostname = value.startsWith("http")
        ? new URL(value).hostname.toLowerCase()
        : value.toLowerCase();

      return (
        emailDomain === hostname ||
        emailDomain.endsWith(`.${hostname}`) ||
        hostname.endsWith(`.${emailDomain}`)
      );
    } catch {
      return false;
    }
  });
}

function selectRecentVideoEmailCandidate(emailCandidates, trustedHosts, channelName) {
  const channelTokens = tokenizeText(channelName);

  const rankedCandidates = [...emailCandidates].sort((left, right) => {
    const scoreCandidate = (candidate) => {
      let score = candidate.count * 20;

      if (emailMatchesKnownHosts(candidate.email, [...trustedHosts, ...candidate.links])) {
        score += 40;
      }

      if (
        hasTokenOverlap(
          tokenizeText(normalizeEmail(candidate.email).replace("@", " ")),
          channelTokens
        )
      ) {
        score += 25;
      }

      if (emailHasHint(candidate.email, CONTACT_EMAIL_HINTS)) {
        score += 15;
      }

      if (emailHasHint(candidate.email, NON_CONTACT_EMAIL_HINTS)) {
        score -= 35;
      }

      return score;
    };

    return scoreCandidate(right) - scoreCandidate(left);
  });

  for (const candidate of rankedCandidates) {
    const knownHosts = [...trustedHosts, ...candidate.links];
    const emailTokens = tokenizeText(normalizeEmail(candidate.email).replace("@", " "));

    if (emailMatchesKnownHosts(candidate.email, knownHosts)) {
      return candidate.email;
    }

    if (hasTokenOverlap(emailTokens, channelTokens)) {
      return candidate.email;
    }

    if (
      isFreeEmailDomain(candidate.email) &&
      hasTokenOverlap(tokenizeText(getEmailLocalPart(candidate.email)), channelTokens)
    ) {
      return candidate.email;
    }

    if (
      candidate.count >= 2 &&
      emailHasHint(candidate.email, CONTACT_EMAIL_HINTS) &&
      !emailHasHint(candidate.email, NON_CONTACT_EMAIL_HINTS)
    ) {
      return candidate.email;
    }
  }

  return "";
}

function matchesContactHint(url) {
  const parsed = new URL(url);
  const target = `${parsed.pathname}${parsed.search}`.toLowerCase();
  return CONTACT_HINTS.some((hint) => target.includes(hint));
}

function canExpandContactPages(url) {
  const parsed = new URL(url);
  return (
    parsed.pathname === "/" ||
    parsed.pathname === "" ||
    matchesContactHint(url)
  );
}

function buildContactUrls(pageUrl, html) {
  const parsed = new URL(pageUrl);
  const candidates = new Set(
    COMMON_CONTACT_PATHS.map((path) => new URL(path, parsed.origin).toString())
  );

  for (const url of extractUrls(html, pageUrl)) {
    if (new URL(url).origin !== parsed.origin) {
      continue;
    }
    if (matchesContactHint(url)) {
      candidates.add(url);
    }
  }

  return prioritizeUrls([...candidates]).slice(0, 8);
}

async function fetchPage(url, timeout = PAGE_TIMEOUT) {
  const document = await fetchTextDocument(
    url,
    "text/html,application/xhtml+xml,*/*",
    timeout
  );
  if (!document) {
    return null;
  }

  const contentType = document.contentType.toLowerCase();
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    return null;
  }

  return document.text;
}

async function fetchTextDocument(url, accept = "*/*", timeout = PAGE_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: accept,
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return null;
    }

    return {
      text: await res.text(),
      contentType: res.headers.get("content-type") || "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractXmlUrls(text, baseUrl) {
  const locMatches = [...text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(
    (match) => match[1]
  );

  return prioritizeUrls(
    [...new Set([...locMatches, ...extractUrls(text, baseUrl)])]
      .map((candidate) => normalizeUrlCandidate(candidate, baseUrl))
      .filter(Boolean)
  );
}

async function fetchSitemapContactUrls(pageUrl) {
  const origin = new URL(pageUrl).origin;

  if (!sitemapCache.has(origin)) {
    sitemapCache.set(
      origin,
      (async () => {
        const discovered = [];
        const seen = new Set();

        for (const path of SITEMAP_PATHS) {
          const sitemapUrl = new URL(path, origin).toString();
          const document = await fetchTextDocument(
            sitemapUrl,
            "application/xml,text/xml,text/plain,*/*"
          );

          if (!document?.text) {
            continue;
          }

          const urls = extractXmlUrls(document.text, sitemapUrl).filter((url) => {
            const parsed = new URL(url);
            return parsed.origin === origin && matchesContactHint(url);
          });

          for (const url of urls) {
            if (!seen.has(url)) {
              discovered.push(url);
              seen.add(url);
            }

            if (discovered.length >= MAX_SITEMAP_URLS) {
              break;
            }
          }

          if (discovered.length >= MAX_SITEMAP_URLS) {
            break;
          }

          await sleep(REQUEST_DELAY_MS);
        }

        return prioritizeUrls(discovered).slice(0, MAX_SITEMAP_URLS);
      })()
    );
  }

  return await sitemapCache.get(origin);
}

async function fetchChannelContexts(channelIds) {
  const contexts = new Map();

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const data = await apiGet("channels", {
      part: "snippet,contentDetails",
      id: batch.join(","),
    });

    for (const item of data.items || []) {
      contexts.set(item.id, {
        description: item.snippet?.description || "",
        uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || "",
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return contexts;
}

function refreshDescriptions(channels, contextMap) {
  let newDescriptionEmails = 0;

  for (const channel of channels) {
    const context = contextMap.get(channel.channelId);
    if (!context) {
      continue;
    }

    if (context.description && context.description.length > (channel.description || "").length) {
      channel.description = context.description;
    }

    if (context.uploadsPlaylistId && !channel.uploadsPlaylistId) {
      channel.uploadsPlaylistId = context.uploadsPlaylistId;
    }

    if (!channel.emailFromDescription) {
      const descriptionEmail = extractEmails(context.description)[0];
      if (descriptionEmail) {
        channel.emailFromDescription = descriptionEmail;
        newDescriptionEmails++;
      }
    }
  }

  return newDescriptionEmails;
}

async function fetchAboutPageData(channel) {
  const aboutUrl = `${channel.url}/about`;
  const html = await fetchPage(aboutUrl);
  if (!html) {
    return { emails: [], links: [] };
  }

  return {
    emails: extractAboutPageEmails(html),
    links: extractYoutubeAboutLinks(html, aboutUrl),
  };
}

async function fetchRecentVideoData(uploadsPlaylistId) {
  if (!uploadsPlaylistId) {
    return { emailCandidates: [], links: [] };
  }

  try {
    const playlistItems = await apiGet("playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(MAX_RECENT_VIDEOS),
    });
    const videoIds = [
      ...new Set(
        (playlistItems.items || [])
          .map((item) => item.contentDetails?.videoId)
          .filter(Boolean)
      ),
    ];

    if (videoIds.length === 0) {
      return { emailCandidates: [], links: [] };
    }

    await sleep(REQUEST_DELAY_MS);

    const videoData = await apiGet("videos", {
      part: "snippet",
      id: videoIds.join(","),
    });

    const emailCandidates = new Map();
    const links = [];
    for (const video of videoData.items || []) {
      const description = video.snippet?.description || "";
      const videoLinks = prioritizeUrls(extractUrls(description));
      links.push(...videoLinks);

      for (const email of extractEmails(description)) {
        const current = emailCandidates.get(email) || {
          email,
          count: 0,
          links: [],
        };
        current.count += 1;
        current.links = prioritizeUrls([...current.links, ...videoLinks]).slice(0, 8);
        emailCandidates.set(email, current);
      }
    }

    return {
      emailCandidates: [...emailCandidates.values()],
      links: prioritizeUrls(links),
    };
  } catch {
    return { emailCandidates: [], links: [] };
  }
}

async function inspectPublicUrl(url) {
  const html = await fetchPage(url);
  if (!html) {
    return { emails: [], discoveredUrls: [] };
  }

  if (isLinkHubUrl(url)) {
    const emails = extractEmails(html).filter((email) => !emailMatchesHost(email, url));
    if (emails.length > 0) {
      return { emails, discoveredUrls: [] };
    }

    return {
      emails: [],
      discoveredUrls: prioritizeUrls(extractUrls(html, url)).slice(0, 8),
    };
  }

  if (isProfilePlatformUrl(url)) {
    return {
      emails: [],
      discoveredUrls: prioritizeUrls(extractUrls(html, url)).slice(0, 8),
    };
  }

  const emails = extractEmails(html);

  if (emails.length > 0) {
    return { emails, discoveredUrls: [] };
  }

  if (isSocialUrl(url)) {
    return { emails: [], discoveredUrls: [] };
  }

  if (!canExpandContactPages(url)) {
    return { emails: [], discoveredUrls: [] };
  }

  const parsed = new URL(url);
  const discoveredUrls = buildContactUrls(url, html);

  if (parsed.pathname === "/" || parsed.pathname === "") {
    const sitemapUrls = await fetchSitemapContactUrls(url);
    return {
      emails: [],
      discoveredUrls: prioritizeUrls([...discoveredUrls, ...sitemapUrls]).slice(
        0,
        8
      ),
    };
  }

  return {
    emails: [],
    discoveredUrls,
  };
}

async function crawlPublicLinks(seedUrls) {
  const queue = prioritizeUrls(seedUrls).slice(0, MAX_LINKS_PER_CHANNEL);
  const seen = new Set(queue);

  for (let i = 0; i < queue.length && i < MAX_LINKS_PER_CHANNEL; i++) {
    const url = queue[i];

    try {
      const { emails, discoveredUrls } = await inspectPublicUrl(url);
      if (emails.length > 0) {
        return { email: emails[0], sourceUrl: url };
      }

      for (const discoveredUrl of prioritizeUrls(discoveredUrls)) {
        if (!seen.has(discoveredUrl) && queue.length < MAX_LINKS_PER_CHANNEL) {
          queue.push(discoveredUrl);
          seen.add(discoveredUrl);
        }
      }
    } catch {
      // Skip failed pages and continue.
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return { email: "", sourceUrl: "" };
}

async function processChannel(channel, context) {
  if (
    channel.emailFromDescription ||
    channel.emailFromAboutPage ||
    channel.emailFromPublicSites
  ) {
    return { email: "", sourceUrl: "" };
  }

  const descriptionLinks = extractUrls(context?.description || channel.description || "");
  const aboutData = await fetchAboutPageData(channel);

  if (aboutData.emails.length > 0) {
    console.log(`    Found public email on About page: ${aboutData.emails[0]}`);
    return {
      email: aboutData.emails[0],
      sourceUrl: `${channel.url}/about`,
    };
  }

  const initialLinks = prioritizeUrls([...descriptionLinks, ...aboutData.links]);
  const trustedHosts = new Set(
    initialLinks.map((url) => new URL(url).hostname.toLowerCase())
  );
  console.log(
    `    Found ${Math.min(initialLinks.length, MAX_LINKS_PER_CHANNEL)} candidate public links`
  );

  const publicResult = await crawlPublicLinks(initialLinks);
  if (publicResult.email) {
    if (
      !isEmailConsistentWithSource(
        publicResult.email,
        publicResult.sourceUrl,
        channel.name
      )
    ) {
      console.log(
        `    Ignored inconsistent public email from ${publicResult.sourceUrl}: ${publicResult.email}`
      );
    } else {
      console.log(
        `    Found email from ${publicResult.sourceUrl}: ${publicResult.email}`
      );
      return publicResult;
    }
  }

  const recentVideoData = await fetchRecentVideoData(
    context?.uploadsPlaylistId || channel.uploadsPlaylistId || ""
  );

  const recentVideoEmail = selectRecentVideoEmailCandidate(
    recentVideoData.emailCandidates,
    [...trustedHosts],
    channel.name
  );

  if (recentVideoEmail) {
    console.log(
      `    Found email in recent video descriptions: ${recentVideoEmail}`
    );
    return {
      email: recentVideoEmail,
      sourceUrl: "recent_video_description",
    };
  }

  const trustedRecentVideoLinks = recentVideoData.links.filter((url) => {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      isLinkHubUrl(url) ||
      matchesTrustedHost(hostname, trustedHosts)
    );
  });

  if (trustedRecentVideoLinks.length > 0) {
    console.log(
      `    Found ${trustedRecentVideoLinks.length} trusted candidate links in recent uploads`
    );
    const videoLinkResult = await crawlPublicLinks(trustedRecentVideoLinks);
    if (videoLinkResult.email) {
      if (
        !isEmailConsistentWithSource(
          videoLinkResult.email,
          videoLinkResult.sourceUrl,
          channel.name
        )
      ) {
        console.log(
          `    Ignored inconsistent public email from ${videoLinkResult.sourceUrl}: ${videoLinkResult.email}`
        );
      } else {
        console.log(
          `    Found email from ${videoLinkResult.sourceUrl}: ${videoLinkResult.email}`
        );
        return videoLinkResult;
      }
    }
  }

  return { email: "", sourceUrl: "" };
}

async function main() {
  if (!existsSync(CHANNELS_FILE)) {
    console.error(`No ${CHANNELS_FILE} found. Run "npm run discover" first.`);
    process.exit(1);
  }

  const channels = JSON.parse(readFileSync(CHANNELS_FILE, "utf-8"));
  const channelIdsWithoutEmail = channels
    .filter(
      (channel) =>
        !channel.emailFromDescription &&
        !channel.emailFromAboutPage &&
        !channel.emailFromPublicSites
    )
    .map((channel) => channel.channelId);

  console.log(
    `Refreshing full descriptions and upload playlists for ${channelIdsWithoutEmail.length} channels...`
  );
  const contextMap = await fetchChannelContexts(channelIdsWithoutEmail);
  const refreshedDescriptionEmails = refreshDescriptions(channels, contextMap);
  ensureParentDir(CHANNELS_FILE);
  writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));

  if (refreshedDescriptionEmails > 0) {
    console.log(
      `Found ${refreshedDescriptionEmails} additional emails in full channel descriptions.`
    );
  }

  const needEmail = channels.filter(
    (channel) =>
      !channel.emailFromDescription &&
      !channel.emailFromAboutPage &&
      !channel.emailFromPublicSites
  );

  console.log(
    `Checking public sites for ${needEmail.length} channels without emails (${channels.length} total)\n`
  );

  let found = 0;

  for (let i = 0; i < needEmail.length; i++) {
    const channel = needEmail[i];
    console.log(
      `[${i + 1}/${needEmail.length}] ${channel.name} (${channel.subscribers.toLocaleString()} subs)`
    );

    const result = await processChannel(channel, contextMap.get(channel.channelId));
    if (result.email) {
      const index = channels.findIndex((current) => current.channelId === channel.channelId);
      if (index !== -1) {
        channels[index].emailFromPublicSites = result.email;
        channels[index].publicEmailSourceUrl = result.sourceUrl || "";
      }
      found++;
    }

    if ((i + 1) % SAVE_EVERY === 0) {
      ensureParentDir(CHANNELS_FILE);
      writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
    }
  }

  ensureParentDir(CHANNELS_FILE);
  writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));

  const totalWithEmail = channels.filter(
    (channel) =>
      channel.emailFromDescription ||
      channel.emailFromAboutPage ||
      channel.emailFromPublicSites
  ).length;

  console.log(`\nDone! Found ${found} new emails from public sources.`);
  console.log(`Total channels with email: ${totalWithEmail}/${channels.length}`);
  console.log(
    `Remaining for CAPTCHA-based collection: ${channels.length - totalWithEmail}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
