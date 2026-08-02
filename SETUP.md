# LI Lead Engine — enabling sync & email digest

Two optional upgrades are built in and waiting for credentials. Both are free.

## 1. Daily email digest (~3 minutes)

The GitHub Action already publishes the digest page every weekday at 7am ET:
https://kmcm1412.github.io/li-lead-engine/digest.html

To ALSO have it emailed to Dom each morning:

1. Use any Gmail account as the sender (yours is fine). It must have 2-Step Verification on.
2. Create an **App Password**: https://myaccount.google.com/apppasswords → name it "lead digest" → copy the 16-character password.
3. Add three secrets to the repo (from this folder):

```bash
gh secret set GMAIL_USER --body "yourgmail@gmail.com"
gh secret set GMAIL_APP_PASSWORD --body "the 16-char app password"
gh secret set DIGEST_TO --body "doms-email@example.com"
```

(Or on github.com: repo → Settings → Secrets and variables → Actions.)

That's it — next weekday morning the digest lands in Dom's inbox. Test immediately with:

```bash
gh workflow run daily-digest.yml
```

Note: if no new filings have appeared since the last digest, the email is skipped for that day.

## 2. Cross-device pipeline sync (~10 minutes)

The app already contains the sync engine; it activates when you fill in `sync-config.js`.

1. Go to https://console.firebase.google.com → **Add project** (name: `li-lead-engine`, Analytics off).
2. In the project: **Build → Firestore Database → Create database** → Production mode → location `nam5 (us-central)`.
3. Firestore → **Rules** tab → replace with the below and Publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pipelines/{doc} {
      allow read, write: if true;
    }
  }
}
```

(The sync code itself is the secret — anyone without Dom's exact code can't find his list. Fine for this use; tell Dom to pick a long code.)

4. Project overview → ⚙️ **Project settings** → scroll to "Your apps" → **</> (Web)** → register app (no hosting) → copy the `apiKey` and `projectId` from the config it shows.
5. Paste them into `sync-config.js` in this folder, then:

```bash
git add sync-config.js && git commit -m "Enable sync" && git push
```

6. After ~1 minute, the site's **Scripts & Letters** tab shows a "Sync your pipeline across devices" box. Dom makes up a code (e.g. `dom-troiano-8817`), enters it on each device once, and everything stays in sync.

## How it works / maintenance

- **Digest**: `.github/workflows/daily-digest.yml` runs `scripts/digest.mjs` weekdays 11:00 UTC. It tracks already-seen filings in `data/seen.json` so each digest only shows genuinely new businesses. GitHub may pause the schedule after ~60 days of zero repo activity — if the digest stops, just run `gh workflow run daily-digest.yml` once to revive it.
- **Sync**: whole pipeline stored as one Firestore document per sync code; per-item timestamps, last-edit-wins, deletes sync too. Firebase free tier limits (50k reads/20k writes per day) are thousands of times more than this will ever use.
- **Updating the app**: edit `index.html`, push — the site redeploys in ~1 min. `LI-Lead-Engine.html` is the emailable offline copy (kept as a synced duplicate of `index.html`).
