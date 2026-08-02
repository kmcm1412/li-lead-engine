// Daily lead digest: pulls new Suffolk/Nassau business filings, writes digest.html,
// and emails it if Gmail secrets are configured. Run by .github/workflows/daily-digest.yml.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const APP_URL = 'https://kmcm1412.github.io/li-lead-engine/';
const LOOKBACK_DAYS = 4; // covers weekends + the registry's 1-2 day publishing lag
const SEEN_PATH = 'data/seen.json';

const KEYWORDS = [
  [/\b(construction|contracting|contractor|builders?|carpentry|roofing|siding|masonry|concrete|paving|drywall|framing|excavat|demolition|renovation|remodel)/i, 'Contractor', 'WC · GL · Commercial Auto', 3],
  [/\b(plumbing|hvac|heating|cooling|electric(al)?|mechanical|solar)/i, 'Trades', 'WC · GL · Commercial Auto', 3],
  [/\b(landscap|lawn|tree (service|care)|irrigation|gardening|snow (removal|plow))/i, 'Landscaping', 'GL · Commercial Auto · WC', 3],
  [/\b(trucking|logistics|freight|hauling|transport|delivery|moving|courier)/i, 'Trucking/Logistics', 'Commercial Auto · Cargo · WC', 3],
  [/\b(restaurant|pizz|cafe|caffe|coffee|deli|bakery|catering|grill|kitchen|taqueria|sushi|bagel|diner|bbq|food)/i, 'Restaurant/Food', 'BOP · WC · Liquor Liability', 3],
  [/\b(day ?care|child ?care|learning center|preschool)/i, 'Day Care', 'GL · WC · Abuse/Molestation', 3],
  [/\b(salon|barber|nails?|spa|beauty|lash|hair)/i, 'Salon/Beauty', 'BOP · WC', 2],
  [/\b(cleaning|janitorial|maids?|housekeeping)/i, 'Cleaning', 'GL · Bond · WC', 2],
  [/\b(auto (body|repair|glass)|collision|towing|tire|mechanic)/i, 'Auto Services', 'Garage Liability · WC', 3],
  [/\b(home ?care|health ?care|nursing|medical|wellness|therapy|dental|pharmacy)/i, 'Health Services', 'Professional · GL · WC', 2],
  [/\b(fitness|gym|crossfit|yoga|pilates|martial arts|training)/i, 'Fitness', 'GL · Professional', 2],
  [/\b(realty|real estate|properties|property|holdings?|estates|homes|housing|apartments|rentals?)/i, 'Real Estate/Landlord', 'Landlord · Commercial Property', 2],
  [/\b(store|shop|market|boutique|retail|trading|supply|distributors?)/i, 'Retail', 'BOP · Product Liability', 2],
];
function classify(name) {
  for (const [re, label, lines, weight] of KEYWORDS) if (re.test(name)) return { label, lines, weight };
  return { label: '', lines: '', weight: 0 };
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- load seen ids ----
let seen = {};
try { seen = JSON.parse(readFileSync(SEEN_PATH, 'utf8')); } catch { /* first run */ }

// ---- fetch ----
const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
const where = `county in('Suffolk','Nassau') AND initial_dos_filing_date >= '${since}'`;
const url = `https://data.ny.gov/resource/n9v6-gdp6.json?$limit=3000&$order=initial_dos_filing_date DESC&$where=${encodeURIComponent(where)}`;
const rows = await (await fetch(url)).json();
if (!Array.isArray(rows)) throw new Error('Unexpected API response: ' + JSON.stringify(rows).slice(0, 300));

const today = new Date().toISOString().slice(0, 10);
const fresh = rows.filter(r => !seen[r.dos_id]).map(r => {
  const name = r.current_entity_name || '';
  return {
    id: r.dos_id, name,
    filed: (r.initial_dos_filing_date || '').slice(0, 10),
    county: r.county || '',
    addr: [r.dos_process_address_1, r.dos_process_address_2].filter(Boolean).join(', '),
    city: r.dos_process_city || '', zip: (r.dos_process_zip || '').slice(0, 5),
    type: (r.entity_type || '').includes('LIMITED LIABILITY') ? 'LLC' : 'Corp',
    cls: classify(name),
  };
}).sort((a, b) => b.cls.weight - a.cls.weight || b.filed.localeCompare(a.filed));

// ---- update seen (prune > 45 days) ----
for (const r of rows) seen[r.dos_id] = today;
const cutoff = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
for (const [id, d] of Object.entries(seen)) if (d < cutoff) delete seen[id];
mkdirSync('data', { recursive: true });
writeFileSync(SEEN_PATH, JSON.stringify(seen));

// ---- render ----
const hot = fresh.filter(l => l.cls.weight >= 3);
const rest = fresh.filter(l => l.cls.weight < 3);
const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

const card = l => `
  <div style="background:#fff;border:1px solid #dde3ec;border-left:5px solid ${l.cls.weight >= 3 ? '#b91c1c' : '#0033A0'};border-radius:8px;padding:12px 16px;margin-bottom:8px">
    <div style="font-weight:700;font-size:15px">${esc(l.name)}</div>
    <div style="color:#5c6675;font-size:13px">${esc(l.addr ? l.addr + ', ' : '')}${esc(l.city)}, NY ${esc(l.zip)} · ${esc(l.county)} County · ${l.type} · filed ${l.filed}</div>
    ${l.cls.lines ? `<div style="color:#0e7c3f;font-size:13px;font-weight:600">→ Likely needs: ${l.cls.lines}</div>` : ''}
    <div style="margin-top:6px"><a href="https://www.google.com/search?q=${encodeURIComponent('"' + l.name + '" ' + l.city + ' NY')}" style="color:#0033A0;font-size:13px">🔍 Google this business</a></div>
  </div>`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lead Digest — ${dateLabel}</title></head>
<body style="margin:0;font-family:'Segoe UI',system-ui,Arial,sans-serif;background:#f4f6fa;color:#1a2233">
<div style="max-width:680px;margin:0 auto;padding:20px 14px">
  <div style="background:#0033A0;color:#fff;border-radius:10px;padding:18px 22px;margin-bottom:16px">
    <div style="font-size:20px;font-weight:700">🛡️ New Business Leads — Long Island</div>
    <div style="font-size:13.5px;opacity:.85">${dateLabel} · ${fresh.length} new since the last digest (${hot.length} high-priority) · Suffolk &amp; Nassau</div>
  </div>
  ${fresh.length === 0 ? '<p style="text-align:center;color:#5c6675;padding:30px">No new filings since the last digest. Check back tomorrow.</p>' : ''}
  ${hot.length ? `<h2 style="font-size:16px;color:#b91c1c">🔥 High priority (${hot.length})</h2>` + hot.map(card).join('') : ''}
  ${rest.length ? `<h2 style="font-size:16px;color:#0033A0;margin-top:18px">Everything else (${rest.length})</h2>` + rest.slice(0, 150).map(card).join('') + (rest.length > 150 ? `<p style="color:#5c6675;font-size:13px">…and ${rest.length - 150} more in the app.</p>` : '') : ''}
  <div style="text-align:center;margin:22px 0">
    <a href="${APP_URL}" style="background:#0033A0;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;display:inline-block">Open the Lead Engine →</a>
  </div>
  <p style="color:#8a93a3;font-size:12px;text-align:center">Source: NY Dept. of State public filings via data.ny.gov · Generated automatically each weekday morning</p>
</div>
</body></html>`;

writeFileSync('digest.html', html);
console.log(`digest.html written: ${fresh.length} new leads (${hot.length} high-priority)`);

// ---- email (optional) ----
const { GMAIL_USER, GMAIL_APP_PASSWORD, DIGEST_TO } = process.env;
if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  if (fresh.length === 0) { console.log('No new leads — skipping email.'); process.exit(0); }
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"LI Lead Engine" <${GMAIL_USER}>`,
    to: DIGEST_TO || GMAIL_USER,
    subject: `🛡️ ${fresh.length} new LI business leads (${hot.length} hot) — ${dateLabel}`,
    html,
  });
  console.log('Email sent to ' + (DIGEST_TO || GMAIL_USER));
} else {
  console.log('Gmail secrets not set — digest published to the site only.');
}
