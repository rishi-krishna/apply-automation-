# LinkedIn Easy Apply Assistant (Chrome Extension)

This extension scans LinkedIn Jobs pages for `Easy Apply` listings, opens them, fills common questions from your saved profile, and moves through application steps.

## What it does

- Scrolls job results and opens jobs with `Easy Apply`.
- Fills common fields: name, email, phone, city, links, salary, notice period, work authorization, experience.
- Supports custom question answers using JSON mapping.
- Clicks `Next` and `Review`.
- Submits only when `Auto submit applications` is enabled.

## Important notes

- LinkedIn UI changes often, so selectors may break over time.
- Heavy automation can trigger rate limits or account restrictions.
- Resume uploads from your local file system are not auto-handled by this version.
- Start with `Auto submit` turned off to validate answers first.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `auto apply`.

## Use

1. Open a LinkedIn jobs search page (example: `https://www.linkedin.com/jobs/search/...`).
2. Open extension popup.
3. Fill profile fields and click `Save`.
4. Keep `Auto submit` off for first run.
5. Click `Start`.
6. Watch the first few applications and adjust values if needed.

## Custom answers format

Use lowercase question text as the key:

```json
{
  "are you legally authorized to work in the united states?": "Yes",
  "will you now or in the future require sponsorship?": "No"
}
```

