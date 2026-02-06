# Chrome Web Store Submission Checklist

## 1) Package readiness

- [ ] Upload zip from `auto apply` folder.
- [ ] Store listing clearly states single purpose:
  - "Helps user fill LinkedIn Easy Apply forms using user-provided profile data."
- [ ] Mention it only runs on LinkedIn Jobs pages.

## 2) Permissions sanity (least privilege)

Current manifest:
- `storage`
- `activeTab`
- content script match: `https://www.linkedin.com/jobs/*`

Notes:
- No remote code loading.
- No external server endpoints used by extension code.

## 3) Privacy policy URL

- [ ] Publish `PRIVACY.md` as a public URL (GitHub Pages or raw file URL).
- [ ] Paste that URL in Chrome Web Store Dashboard -> Privacy Policy field.

## 4) Data usage disclosure (Dashboard privacy tab)

Because this extension stores user-entered application profile fields, disclose collection/handling of:
- Personal info (name, email, phone, city, profile links)
- Form data / user-provided content (custom answers, work authorization, experience, salary, notice period)
- Sensitive personal data if user enters it (gender, race/ethnicity, veteran/disability status)

Recommended declarations:
- Data is used only for core functionality (form filling).
- Data is not sold.
- Data is not used for ads.
- Data is not used for creditworthiness/lending.
- Data is not transferred to third parties by developer backend.

## 5) In-product disclosure

Popup includes:
- Data notice text
- Explicit consent checkbox before save/start
- Local storage only (`chrome.storage.local`)

## 6) Common rejection traps to avoid

- Do not request extra permissions not used.
- Do not claim "no data handled" (this extension handles user-entered form data).
- Keep description honest: automation assistant, not guaranteed submission.
- If behavior changes to send data to servers later, update policy + disclosures before publishing.
