# YouTube Influencer Scraper

Find YouTube influencers (video game reviewers, board game reviewers, tech reviewers, and family influencers) with 10,000+ subscribers and collect their contact info.

## Setup

1. **Get a YouTube Data API v3 key** from [Google Cloud Console](https://console.cloud.google.com/)
2. Copy `.env.example` to `.env` and add your API key:
   ```
   cp .env.example .env
   ```
3. Install dependencies:
   ```
   npm install
   npx playwright install chromium
   ```
4. Run the unit tests:
   ```
   npm test
   ```

## Usage

### Option 1: Run everything at once
```
npm start
```

### Option 2: Run each step separately

**Step 1 — Discover channels via YouTube API:**
```
npm run discover
```
Searches YouTube for channels in each category, filters to 10k+ subscribers, and saves to `output/channels.json`. Also extracts any email addresses found in channel descriptions.

**Step 2 — Scrape emails from public sites:**
```
npm run scrape-public
```
Before resorting to CAPTCHAs, this step refreshes the full channel description, checks recent upload descriptions for repeated direct contact emails, and crawls publicly linked creator sites. It also decodes common public email obfuscation patterns, inspects same-origin sitemap/contact pages, and rejects obvious platform, legal-page, shortener, and support-email noise before saving a public email.

**Step 3 — Collect remaining emails via browser:**
```
npm run collect-emails
```
For channels that still need emails after steps 1 and 2, this opens a browser window and navigates to each channel's About page. It keeps each page open until you choose to skip, quit, or press Enter after revealing the email yourself. You can also ask it to try clicking the "View email address" button for you or paste the email directly into the terminal. Progress is saved after each channel.

**Step 4 — Export to CSV:**
```
npm run export-csv
```
Exports all collected data to `output/influencers.csv`.

## Output

- `output/channels.json` — raw channel data (intermediate)
- `output/influencers.csv` — final CSV with columns:
  - Channel Name
  - Category
  - Subscribers
  - Channel URL
  - Email
  - Email Source (description, public_site, or about_page)
  - Description

## Categories

- `video_game_reviewer` — Video game review channels
- `board_game_reviewer` — Board game / tabletop review channels
- `tech_reviewer` — Tech / gadget review channels
- `family_influencer` — Mom, dad, kid, and family vlog channels
