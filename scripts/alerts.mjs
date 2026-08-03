// Speed-to-lead alerts: checks the quote-request inbox every 15 minutes,
// emails Dom instantly-styled alerts for new submissions, and sends the
// consumer an acknowledgment. Run by .github/workflows/lead-alerts.yml.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CODE = process.env.INBOX_CODE;
if (!CODE) { console.log('INBOX_CODE repo variable not set — skipping. Set it with: gh variable set INBOX_CODE -R kmcm1412/li-lead-engine --body "<code from the app link>"'); process.exit(0); }
const { GMAIL_USER, GMAIL_APP_PASSWORD, DIGEST_TO } = process.env;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) { console.log('Gmail secrets not set — skipping.'); process.exit(0); }

const KEY = 'AIzaSyBQpiWpPM-sim2Up5RG7NroKfrtePL43i0';
const APP_URL = 'https://kmcm1412.github.io/li-lead-engine/';
const url = `https://firestore.googleapis.com/v1/projects/li-lead-engine/databases/(default)/documents/pipelines/inbox-${encodeURIComponent(CODE)}?key=${KEY}`;

let seen = {};
try { seen = JSON.parse(readFileSync('data/notified.json', 'utf8')); } catch { /* first run */ }

const r = await fetch(url);
if (r.status === 404) { console.log('No inbox document yet.'); process.exit(0); }
if (!r.ok) throw new Error('Firestore HTTP ' + r.status);
const d = await r.json();
let subs = [];
try { subs = JSON.parse((d.fields && d.fields.data && d.fields.data.stringValue) || '[]'); } catch { }

const fresh = subs.filter(s => s.ts && !seen[s.ts]);
if (!fresh.length) { console.log('No new submissions.'); process.exit(0); }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nodemailer = (await import('nodemailer')).default;
const tp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });

for (const s of fresh) {
  const outside = s.acc === '2+' || s.cov === 'no' || s.dwi === 'yes' || s.state === 'other';
  const tag = outside ? '⚠️ check criteria' : '✅ qualifies';
  await tp.sendMail({
    from: `"LeadEngine LI" <${GMAIL_USER}>`,
    to: DIGEST_TO || GMAIL_USER,
    subject: `🔥 NEW QUOTE REQUEST — ${s.name} (${tag})`,
    html: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#0033A0;color:#fff;border-radius:10px 10px 0 0;padding:14px 20px">
    <div style="font-size:17px;font-weight:700">🔥 New quote request</div>
    <div style="font-size:12.5px;opacity:.85">Speed wins — leads contacted in the first 5 minutes close many times more often.</div>
  </div>
  <div style="border:1px solid #dde3ec;border-top:none;border-radius:0 0 10px 10px;padding:18px 20px">
    <div style="font-size:19px;font-weight:800">${esc(s.name)}</div>
    <div style="font-size:22px;margin:8px 0"><a href="tel:${esc(s.phone)}" style="color:#0033A0;font-weight:800;text-decoration:none">📞 ${esc(s.phone)}</a></div>
    ${s.email ? `<div>✉️ <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></div>` : ''}
    ${s.town ? `<div>📍 ${esc(s.town)}</div>` : ''}
    <table style="font-size:14px;margin-top:10px;border-collapse:collapse">
      ${s.products ? `<tr><td style="color:#5b6478;padding:2px 14px 2px 0">Wants</td><td><b>${esc(s.products)}</b></td></tr>` : ''}
      ${s.carrier ? `<tr><td style="color:#5b6478;padding:2px 14px 2px 0">Current carrier</td><td>${esc(s.carrier)}</td></tr>` : ''}
      ${s.renew ? `<tr><td style="color:#5b6478;padding:2px 14px 2px 0">Renews</td><td>${esc(s.renew)}</td></tr>` : ''}
      <tr><td style="color:#5b6478;padding:2px 14px 2px 0">At-fault accidents (3yr)</td><td>${esc(s.acc || '?')}</td></tr>
      <tr><td style="color:#5b6478;padding:2px 14px 2px 0">DWI (5yr)</td><td>${esc(s.dwi || '?')}</td></tr>
      <tr><td style="color:#5b6478;padding:2px 14px 2px 0">12mo continuous coverage</td><td>${esc(s.cov || '?')}</td></tr>
      ${s.state && s.state !== 'NY' ? `<tr><td style="color:#5b6478;padding:2px 14px 2px 0">State</td><td><b style="color:#bb1d1d">NOT NY</b></td></tr>` : ''}
      ${s.src ? `<tr><td style="color:#5b6478;padding:2px 14px 2px 0">Came from</td><td>${esc(s.src)}</td></tr>` : ''}
      ${s.notes ? `<tr><td style="color:#5b6478;padding:2px 14px 2px 0">Notes</td><td>${esc(s.notes)}</td></tr>` : ''}
    </table>
    <div style="margin-top:14px"><a href="${APP_URL}" style="background:#0033A0;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;display:inline-block">Open LeadEngine →</a></div>
  </div>
</div>`,
  });
  if (s.email && /.+@.+\..+/.test(s.email)) {
    await tp.sendMail({
      from: `"Dom Orza — The Troiano Agency (Allstate)" <${GMAIL_USER}>`,
      to: s.email,
      subject: 'Got your quote request — Dom Orza, The Troiano Agency (Allstate)',
      html: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;font-size:15px;line-height:1.55;color:#16203a">
  <p>Hi ${esc(s.name.split(' ')[0])},</p>
  <p>Thanks for your quote request — it just landed on my desk and I'll be reaching out shortly with your numbers${s.products ? ' for ' + esc(s.products.toLowerCase()) : ''}.</p>
  <p>Want them faster? Call or text me directly at <b>(631) 724-2100</b> and mention you sent the form.</p>
  <p>Talk soon,<br><b>Dom Orza</b><br>The Troiano Agency — Allstate<br>25 Manor Rd, Smithtown, NY 11787<br>(631) 724-2100</p>
</div>`,
    });
  }
  seen[s.ts] = new Date().toISOString().slice(0, 10);
  console.log('Alerted for: ' + s.name);
}

// prune tracking entries older than 90 days
const cut = Date.now() - 90 * 864e5;
for (const k of Object.keys(seen)) if (+k < cut) delete seen[k];
mkdirSync('data', { recursive: true });
writeFileSync('data/notified.json', JSON.stringify(seen));
console.log(`Done — ${fresh.length} alert(s) sent.`);
