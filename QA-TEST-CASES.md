# BlockMyCard — QA Test Suite

**Application:** BlockMyCard.in (card-blocker)
**Repository:** https://github.com/webologist/card-blocker
**Environment under test:** https://card-blocker.vercel.app (production)
**Test date:** 31 July 2026
**Prepared by:** QA Automation Lead

---

## 1. Scope and approach

The suite is organised by **user role**, because this application's risk is
concentrated in what each role can reach rather than in any single screen. A
case that passes for the owner of an account is a different case entirely when
the actor is a family member acting on their behalf, or an anonymous caller
hitting the same endpoint with `curl`.

Seven role groups:

| # | Role | Who they are | Cases |
|---|------|--------------|-------|
| R1 | Guest / Unauthenticated Visitor | Anyone who lands on the marketing site | 22 |
| R2 | New User (Registration & Onboarding) | First-time signup through OTP | 26 |
| R3 | Registered User — Free tier | Signed in, chose not to save cards | 12 |
| R4 | Registered User — Paid tier | Signed in, ₹50/card, cards saved | 23 |
| R5 | Alternate / Family Contact | Signed in on behalf of the account owner | 20 |
| R6 | Admin | Operator of the in-app admin console | 18 |
| R7 | Unauthenticated API Client | The attacker surface; no UI involved | 21 |
| | | **Total** | **142** |

Of these, **87 carry a recorded result** — executed against the live site, against
the local harness, or by code inspection where the row says so. The remaining
**55** are specified for the automation backlog and marked `📋 Not executed`.

### Negative-path note

The heaviest cluster of defects in this suite is in R5, and every one of them is
a **negative** path — the alternate-number login with an input the flow did not
expect. The happy path works. What was never handled is *refusal*: the code has
a branch for "this number belongs to an account" and a branch for "this is a new
user", and nothing in between. Every unrecognised alternate fell into the
new-user branch, including numbers that already had accounts. Cases ALT-LOG-05
through ALT-LOG-08 exist because of that shape and are worth carrying forward as
a regression set.

### Architecture facts that shape the suite

Three properties of the build determine what can and cannot be tested, and are
worth stating before the cases:

1. **`app.js` is a minified React bundle with no source in the repository.**
   Application behaviour is therefore fixed at the black-box level; defects
   inside it can be reported but not patched. Several behaviours are steered
   from outside it by DOM-patching bridges (`otp-bridge.js`,
   `admin-otp-toggle.js`, `admin-contact-messages.js`,
   `login-email-notifier.js`) that poll on timers and match on **button label
   text**. That coupling is fragile and is the direct cause of BUG-02, BUG-09
   and BUG-10 below — any copy change to a button silently breaks a flow.

2. **There is no server-side persistence in production.** `app.js` ends with
   `window.storage||(window.storage={...localStorage...})`, and nothing on the
   page defines `window.storage` first. `api/storage.js` and
   `lib/storage-policy.js` exist, are well written, and are **never called** —
   confirmed by the network log across a full registration. All account data
   lives in the visitor's own browser. This invalidates the product's central
   promise and is BUG-01.

3. **Dummy OTP mode is open on production by owner decision.** `1234` verifies
   any Indian mobile number; no SMS is sent. This is documented deliberately in
   `lib/otp-mode.js` (`ALLOW_DUMMY_ON_PRODUCTION = true`). The suite tests
   against that reality rather than around it, and flags what it costs.

### Test data

| Item | Value |
|------|-------|
| Valid test numbers | `9000000002`, `9811100011`, `9822200022` (alternate) |
| OTP (all numbers, current config) | `1234` |
| Admin number | `9223548779` (hardcoded in `app.js`) |
| Invalid-format numbers | `1234567890`, `5999999999`, `98111000` |
| Test email | `qa.test@example.com` |
| Local harness | Node stub serving the working tree with real `lib/otp-*` modules |

### Legend

`✅ Pass` · `❌ Fail` · `🔧 Fixed & retested` · `⚠️ Pass with observation` · `⏸ Blocked` · `📋 Not executed (documented for the suite)`

---

## 2. Defect register

Severity is business impact, not code size.

| ID | Sev | Defect | Status |
|----|-----|--------|--------|
| BUG-01 | **Blocker** | No server-side storage. Account data lives only in the browser's `localStorage`; `/api/storage` is never called. Signing in on a second device silently **re-registers the number as a brand-new empty account** — name, email, saved cards and paid status all gone. The advertised "sign in from a friend's phone" flow cannot work. | Open — needs product decision |
| BUG-02 | **Blocker** | Alternate-number OTP is never requested. Both screens claim "An OTP has been sent to …", but `otp-bridge.js` only fires on a button labelled `Send OTP`, which neither screen has. Verify then fails with "OTP was not sent". The family-contact role was unreachable. | 🔧 Fixed, retested |
| BUG-03 | **Critical** | Dummy OTP open on production: `1234` authenticates any number. Every account is reachable by anyone who knows a phone number. | Open — accepted by owner, documented in `lib/otp-mode.js` |
| BUG-04 | **Critical** | Admin console has no server-side authorisation. The admin number is a plain string in `app.js` (`9223548779`); combined with BUG-03, any visitor can enter the console and edit banks, blocking templates, user records and OTP mode. | Open — needs real admin auth |
| BUG-05 | **High** | `verify-otp`'s dummy branch answered before validating the challenge token, so a request that had never touched `send-otp` still minted a `phoneToken` for any number. The 3-per-10-min send limit bounded nothing. | 🔧 Fixed, retested |
| BUG-06 | **High** | Wrong-OTP response told every visitor `Hint: dummy OTP is 1234`. | 🔧 Fixed, retested |
| BUG-07 | **High** | `/api/login-email` was unauthenticated and trusted the request body. Anyone knowing a registered number could send repeated "Security alert: new sign-in" mails to that user by varying `ts`, and could distinguish registered from unregistered numbers by the reply (`sent` vs `no-email`). | 🔧 Fixed, retested |
| BUG-19 | **Blocker** | Signing in with your **own registered number** but the *Alternate* toggle selected **destroys the account**. `hv()` looks the number up by `altPhone` only, finds nothing, and falls through to the new-user branch, which writes `{...u,[phone]:{name:"",cards:[],paid:false,email:"",altPhone:""}}` straight over the existing record. Verified: a paid account lost its name, email, saved card, paid flag and verified alternate. No warning, no confirmation, no undo — one mistap on a two-button toggle. | 🔧 Fixed, retested |
| BUG-20 | **High** | Signing in as *Alternate* with a number nobody nominated silently **registers it as a new own account** — logs "Registered", fires the welcome SMS and WhatsApp. The user stated the number belongs to someone else and the app made them an account holder, with no message explaining the number isn't linked to anyone. | 🔧 Fixed, retested |
| BUG-21 | **High** | `altVerified` was never checked at login — `hv()` matched on `altPhone` alone. Since the admin console writes `altPhone` as a plain text field with no OTP, any number typed there became a working key to that account. `lib/storage-policy.js` requires `altVerified` for the same decision server-side; the client that actually runs disagreed with it. | 🔧 Fixed, retested |
| BUG-22 | Medium | When two accounts nominate the **same** alternate number, `Object.values(u).find(...)` returns the first match only. Verified: the alternate lands on Parent One and Parent Two's cards are unreachable, with no picker and no indication a second account exists. This is precisely the "keep a parent's card list alongside yours" scenario on the landing page. | Open — needs an account-picker UI |
| BUG-08 | Medium | The alternate contact has full write access: they can delete the owner's saved cards and change the account email (which redirects all notifications). Only the alternate-number field is locked. | Open — permission model decision |
| BUG-09 | Medium | A `Resend OTP in Ns` countdown injected on the OTP screen was never removed, and kept ticking under the register screen and dashboard. | 🔧 Fixed, retested |
| BUG-10 | Medium | The Quick-login panel keyed off "a `tel` input exists", so it rendered on the contact screen and dashboard — anchored above the page header. | 🔧 Fixed, retested |
| BUG-11 | Low | The failed-attempt toast stayed on screen for 10s after a subsequent successful verification, so users reached the dashboard still being told the OTP was wrong. | 🔧 Fixed, retested |
| BUG-12 | Medium | `Go back` from the alternate-OTP screen clears the already-typed email and alternate number. Inside `app.js`; not patchable from source. | Open |
| BUG-13 | Medium | Five legal pages ship but are unlinked from the site: `refund-policy.html`, `grievance-redressal.html`, `data-security.html`, `business-info.html`, `terms.html`. Footer links only 3 of 8. Grievance redressal and refund policy being unreachable is a consumer-compliance exposure for an India-facing paid service. | Open |
| BUG-14 | Low | Admin → Users lists the internal placeholder record `__no_demo__` as a user account. | Open (`app.js`) |
| BUG-15 | Low | Two admin tabs are both labelled **Messages** (blocking templates, and contact-form messages). | Open |
| BUG-16 | Low | `lib/otp-rate-limit.js` is a notes file shaped like a module — it `require`s itself and is not valid runtime JS. Nothing imports it today; anything that does will 500. | Open — delete or implement |
| BUG-17 | Low | The `SIMULATED MESSAGES SENT TO YOU` developer panel is visible to real users on production. | Open (`app.js`) |
| BUG-18 | Medium | Payment is simulated end to end — "Payment successful (simulated)" is shown, `paid: true` and `paidAmount: 50` are recorded, no gateway is involved. Acceptable for a demo; a material misrepresentation if the ₹50 offer is presented as live. | Open — product decision |

### What was fixed and verified

BUG-02, 05, 06, 07, 09, 10, 11 — `otp-bridge.js`, `api/verify-otp.js`,
`api/login-email.js`, `login-email-notifier.js`.
BUG-19, 20, 21 — `app.js`, in the `hv()` lookup and the login branch it feeds.

All on `fix/session-survives-refresh`. Retested in-browser against a local
harness that loads the real `lib/otp-token.js`, `lib/otp-mode.js` and
`lib/phone-token.js` with `VERCEL_ENV=production`.

The `app.js` change is a hand-patch to a minified bundle with no source in the
repo — the same way the file has already been maintained (`bmcSession`,
`setPhoneDraft` and other readable identifiers in it are earlier hand-patches).
If a build pipeline for it is ever restored, these three fixes must be carried
into the source or they will be overwritten.

**The fixes are committed but not deployed.** They reach users only when the
branch is merged and Vercel redeploys.

---

## 3. R1 — Guest / Unauthenticated Visitor

Anyone who lands on the site without signing in. Highest-traffic role; also the
role that decides whether the service is trusted at all.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| GST-NAV-01 | Landing page renders | Open `/` | Hero, fraud stats, features, how-it-works, block steps, card tool, FAQ, footer all render | ✅ Pass |
| GST-NAV-02 | No console errors on load | Open `/`, read console | No errors or warnings | ✅ Pass |
| GST-NAV-03 | Anchor navigation | Click Features / Fraud Data / How it Works / Block Steps / Card Blocker | Each scrolls to its section | ✅ Pass |
| GST-NAV-04 | Primary CTAs reach the tool | Click "Register Free — 60 Seconds", "Block your card", "Register/ Block" | All land on `#card-tool` | ✅ Pass |
| GST-NAV-05 | Skip-to-content link | Tab once from page top, press Enter | Focus moves to main content | 📋 Not executed |
| GST-NAV-06 | Construction banner dismiss | Click ✕ on "Site under construction" | Banner closes and stays closed for the session | 📋 Not executed |
| GST-NAV-07 | Mobile menu | At 375px, open ☰, navigate, close | Menu opens, links work, `aria-expanded` toggles, ✕ closes | 📋 Not executed |
| GST-RSP-01 | Mobile has no horizontal scroll | Resize to 375×812, measure `scrollWidth` vs `innerWidth` | Equal; no element overflows the viewport | ✅ Pass — 375 = 375, zero overflowing elements |
| GST-RSP-02 | Tablet layout | Resize to 768×1024 | Grids reflow; nothing clipped | 📋 Not executed |
| GST-RSP-03 | Desktop layout | 1280×800 | Full nav visible, no mobile menu | ✅ Pass |
| GST-I18N-01 | Language switch persists | Set language to हिन्दी, reload | Copy stays Hindi; `bmc_lang` persists in `localStorage` | 📋 Not executed |
| GST-I18N-02 | All 10 languages selectable | Cycle en, hi, mr, gu, bn, te, ta, kn, or, ml | Each applies; no missing-key fallback text visible | 📋 Not executed |
| GST-I18N-03 | Language carries to legal pages | Set Hindi on `/`, open `/privacy.html` | Header strings in Hindi (`assets/site-header.js` shares `bmc_*` keys) | 📋 Not executed |
| GST-I18N-04 | Invalid language rejected | Console: `setLang('xx')` | Ignored; allowlist in `assets/site-header.js` holds | 📋 Not executed |
| GST-A11Y-01 | Font-size control | Cycle A sizes; reload | Size applies and persists via `bmc_font` | 📋 Not executed |
| GST-A11Y-02 | Theme toggle | Toggle dark/light; reload | Theme persists via `bmc_theme`; no flash of wrong theme (pre-paint snippet) | 📋 Not executed |
| GST-A11Y-03 | Dropdowns close on Escape / outside click | Open Language, press Esc; reopen, click elsewhere | Closes both ways; `aria-expanded=false` | 📋 Not executed |
| GST-A11Y-04 | Keyboard-only journey to the tool | Tab from top to the mobile-number field | Reachable; focus visible throughout | 📋 Not executed |
| GST-LEG-01 | Footer legal links resolve | Click Trust & Security, Privacy Policy, Terms and Conditions | All return 200 and render | ✅ Pass |
| GST-LEG-02 | **All shipped legal pages are reachable** | Enumerate footer links vs `*.html` in repo | Every published policy is linked | ❌ **Fail — BUG-13.** Footer links 3 of 8. `refund-policy`, `grievance-redressal`, `data-security`, `business-info`, `terms` return 200 but have no inbound link |
| GST-LEG-03 | Grievance officer discoverable | From `/`, reach grievance-redressal in ≤2 clicks | Reachable | ❌ **Fail — BUG-13.** Not reachable from any page |
| GST-SEC-01 | Security headers present | Inspect response headers on `/` | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` per `vercel.json` | 📋 Not executed |

---

## 4. R2 — New User (Registration & Onboarding)

First-time visitor completing signup. Three screens: OTP → cards → contact
details, with a payment prompt between.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| REG-OTP-01 | Send OTP with a valid number | Enter `9000000002` as *Own*, tap Send OTP | Moves to the OTP screen, "An OTP has been sent to 9000000002" | ✅ Pass |
| REG-OTP-02 | Reject short number | Enter `98111000`, Send OTP | Inline error; no request sent | 📋 Not executed |
| REG-OTP-03 | Reject numbers not starting 6–9 | Enter `1234567890`, Send OTP | "Enter a valid 10-digit Indian mobile number (starting with 6-9)" | ✅ Pass (API returns 400) |
| REG-OTP-04 | Reject non-numeric input | Type letters into the number field | Field accepts digits only | 📋 Not executed |
| REG-OTP-05 | Accepts `+91` / `91` prefixes | Enter `+919000000002` | Normalised to 10 digits and accepted | 📋 Not executed |
| REG-OTP-06 | Wrong OTP is rejected | Send OTP, enter `9999`, Verify | Stays on the OTP screen with an error | ✅ Pass |
| REG-OTP-07 | **Wrong-OTP message must not reveal the code** | Enter a wrong OTP, read the toast | Generic "Incorrect OTP. Please try again." | ❌→🔧 **Was: "Incorrect OTP. Hint: dummy OTP is 1234." shown to every visitor (BUG-06).** Fixed; retested → generic message on a production deployment |
| REG-OTP-08 | Correct OTP proceeds | Enter `1234`, Verify | Registers and lands on Step 2 of 3 | ✅ Pass |
| REG-OTP-09 | **Stale error toast clears on success** | Fail once, then verify correctly | No error toast on the next screen | ❌→🔧 **Was: failed-attempt toast persisted onto the dashboard (BUG-11).** Fixed; retested → toast hidden |
| REG-OTP-10 | Attempt lockout | 5 wrong codes against one token | 6th returns 429 "Too many incorrect attempts" | 🔧 Pass after fix — `400,400,400,400,400,429,429` |
| REG-OTP-11 | Send rate limit | Request OTP 5× for one number | 4th and 5th return 429 | ✅ Pass — `200,200,200,429,429` |
| REG-OTP-12 | Resend countdown | On the OTP screen, wait 60s | Button counts down then enables; resend issues a new OTP | ⚠️ Pass with observation — see REG-OTP-13 |
| REG-OTP-13 | **Resend control is removed with the OTP screen** | Verify successfully, look at the next screen | No resend control anywhere | ❌→🔧 **Was: "Resend OTP in 15s" still ticking under the dashboard (BUG-09).** Fixed; retested → removed |
| REG-OTP-14 | Expired OTP | Wait >5 min, then verify | "OTP has expired." | 📋 Not executed (timing) |
| REG-CRD-01 | Name is captured | Enter full name on Step 2 | Stored on the record | ✅ Pass |
| REG-CRD-02 | Add a card | Pick type, bank, last 4, "+ Add card" | Appears under "Cards added (1)" | ✅ Pass |
| REG-CRD-03 | Last-4 accepts exactly 4 digits | Enter 3 digits, then 5 | Add disabled at 3; capped at 4 | 📋 Not executed |
| REG-CRD-04 | Add multiple cards | Add three cards across banks | All three listed | 📋 Not executed |
| REG-CRD-05 | Remove a staged card | Add two, remove one | Count drops to 1 | 📋 Not executed |
| REG-PAY-01 | Payment prompt appears | Continue from Step 2 | "One-time fee: ₹50 per card" with YES / NO | ✅ Pass |
| REG-PAY-02 | Paying saves the cards | Choose YES | "Payment successful (simulated). Cards saved ✓", proceeds to Step 3 | ⚠️ Pass — **no payment gateway is involved (BUG-18)** |
| REG-PAY-03 | Declining keeps the account free | Choose NO | Free account; cards not persisted | 📋 Not executed |
| REG-CON-01 | Email is saved | Enter email on Step 3, continue | Shows on the dashboard under Contact details | ✅ Pass |
| REG-CON-02 | Invalid email rejected | Enter `not-an-email` | Validation error | 📋 Not executed |
| REG-CON-03 | Skip for now | Tap "Skip for now" | Lands on the dashboard with contact details unset | ✅ Pass |
| REG-CON-04 | **Back navigation preserves typed input** | Type email + alternate number, tap Send, then Go back | Both fields still populated | ❌ **Fail — BUG-12.** Both fields are cleared |

---

## 5. R3 — Registered User, Free tier

Signed in, declined the ₹50 save. Card details are entered per session and never
stored.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| FRE-DSH-01 | Free dashboard copy | Sign in on a free account | "Free account — enter the card details, then tap Block. (Details are not saved.)" | 📋 Not executed |
| FRE-DSH-02 | No saved-card list | Inspect the dashboard | No persistent card list; only the quick-entry form | 📋 Not executed |
| FRE-DSH-03 | Ad-hoc card entry | Enter type, bank, last 4, "Add card to block" | Card appears for this session only | 📋 Not executed |
| FRE-DSH-04 | Session card is discarded | Add a card, log out, sign back in | Card is gone | 📋 Not executed |
| FRE-DSH-05 | Blocking works without paying | Add an ad-hoc card, tap Block | Full SMS / email / helpline panel is shown | 📋 Not executed |
| FRE-DSH-06 | No Edit control on cards | Inspect an ad-hoc card | Only "Remove"; Edit is paid-only | 📋 Not executed |
| FRE-DSH-07 | Contact-details block hidden | Inspect the dashboard | Contact details section is paid-only | 📋 Not executed |
| FRE-UPG-01 | Upgrade path | Add a card, choose "YES — Save" | Card persists; account flips to Paid | 📋 Not executed |
| FRE-SES-01 | Session survives refresh | Sign in, reload | Still signed in on the dashboard | ✅ Pass (verified on a paid account; same code path) |
| FRE-SES-02 | Session expires after 12h | Age `cbp:session.at` beyond 12h, reload | Returns to the login screen | 📋 Not executed |
| FRE-SES-03 | Logout clears the session | Log out, reload | Login screen; `cbp:session` and OTP keys removed | ✅ Pass |
| FRE-SES-04 | Feedback prompt | Perform a block action, then log out | Feedback modal (1–5) appears | 📋 Not executed |

---

## 6. R4 — Registered User, Paid tier

The paying customer. Cards are saved; this is the role the product is sold on.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| PAY-DSH-01 | Saved cards listed | Sign in on a paid account | Every saved card shown with bank, type, last 4 | ✅ Pass |
| PAY-DSH-02 | Add a card post-signup | "+ Add card", complete the form | Added, with its own ₹50 prompt | 📋 Not executed |
| PAY-DSH-03 | Edit a card | Edit, change bank and last 4, Save | Persists after reload | 📋 Not executed |
| PAY-DSH-04 | Delete a card | Delete, confirm | Removed after confirmation dialog | 📋 Not executed |
| PAY-DSH-05 | Delete is confirmed first | Delete, then Cancel | Card retained | 📋 Not executed |
| PAY-BLK-01 | Block panel opens | Tap 🚫 Block | Ordered SMS → email → helpline panel | ✅ Pass |
| PAY-BLK-02 | SMS block details | Read panel section 1 | Correct bank SMS number and body with the right last 4 | ✅ Pass — `7308080808` / `BLOCKCARD 4321` |
| PAY-BLK-03 | Unverified-bank warning | Block a card on a bank with `verified: false` | Amber "SMS format is unverified" banner | ✅ Pass |
| PAY-BLK-04 | Copy buttons | Tap each Copy | Clipboard receives the value; label flips to "Copied ✓" | 📋 Not executed |
| PAY-BLK-05 | Email template correctness | Read panel section 2 | Contains name, registered mobile, card type, last 4, bank | ✅ Pass |
| PAY-BLK-06 | mailto link | Tap "Open in email app" | `mailto:` with pre-filled subject and body | ✅ Pass (href verified) |
| PAY-BLK-07 | Helpline link | Tap the helpline | `tel:` link to the bank's 24×7 number | ✅ Pass — `tel:180016001600` |
| PAY-BLK-08 | Desktop guidance | Open the block panel on desktop | Explains SMS must be sent from the registered mobile | ✅ Pass |
| PAY-BLK-09 | Mobile SMS deep link | Open the block panel on a mobile UA | Red "Open SMS app (pre-filled)" button with an `sms:` href | 📋 Not executed |
| PAY-BLK-10 | Cybercrime guidance | Read the panel header | Points at `cybercrime.gov.in` and `1930` | ✅ Pass |
| PAY-BLK-11 | Exit modal after blocking | Block a card, then log out | "Which cards did you block?" modal | ✅ Pass |
| PAY-BLK-12 | Marking a card blocked | Tick a card, "Submit & log out" | Card carries a "Blocked ✓" badge next session | 📋 Not executed |
| PAY-CON-01 | Edit email | Contact details → Edit email, save | Updates and persists | 📋 Not executed |
| PAY-CON-02 | Email validation | Save `abc@` | "Enter a valid email address." | 📋 Not executed |
| PAY-CON-03 | Delete email | Delete, confirm | Reverts to "Not set" | 📋 Not executed |
| PAY-CON-04 | **Add and verify an alternate number** | Contact details → Edit alternate → enter number → "Save & verify" → enter OTP | Shows "✓ verified" | ❌→🔧 **Was: no OTP ever requested; verification impossible (BUG-02).** Fixed; retested → "9822200022 ✓ verified" |
| PAY-XDV-01 | **Sign in from a second device** | Register on device A; on device B (clean storage) sign in with the same number as *Own* | Dashboard with the same name, email and saved cards | ❌ **Fail — BUG-01 (Blocker).** Lands on "Step 2 of 3 — Add your cards" as a brand-new account. Name, email, cards and paid status are all gone. This is the product's headline promise |
| PAY-XDV-02 | Data survives clearing site data | Clear `localStorage`, reload, sign in | Account intact | ❌ **Fail — BUG-01.** Account silently recreated empty |

---

## 7. R5 — Alternate / Family Contact

A trusted second number that can act on the owner's behalf when the owner's
phone is lost. **This entire role is unreachable on the deployed build** — the
alternate number can never be verified (BUG-02), and `altVerified` is what
grants the access. All results below are from the fixed build on the local
harness.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| ALT-VER-01 | Verify from registration Step 3 | Enter email + alternate number → "Save & verify alternate number" → `1234` | Verified; lands on the dashboard | 🔧 Pass after fix (❌ on production) |
| ALT-VER-02 | Verify from the dashboard | Contact details → Edit alternate → "Save & verify" → `1234` | Marked "✓ verified" | 🔧 Pass after fix (❌ on production) |
| ALT-VER-03 | Bad alternate number is refused | Enter `1234567890` | App's own inline validation fires; no OTP requested | 🔧 Pass after fix |
| ALT-VER-04 | **Alternate verification must not overwrite the session identity** | Verify an alternate, then inspect `bmc_phone_token` | Token still proves the *owner's* number, not the alternate's | 🔧 Pass — decodes to `+919811100011` (owner), alternate was `9822200022` |
| ALT-VER-05 | **Unverified alternate grants nothing** | Seed an account with `altPhone` set and `altVerified: false` (the admin-console path); sign in on that number as *Alternate* | Refused | ❌→🔧 **Was: full access to the owner's account granted (BUG-21).** Fixed; retested → refused |
| ALT-LOG-01 | Sign in as the alternate | Login screen → "Alternate number" → alternate number → `1234` | Reaches the owner's dashboard | 🔧 Pass after fix |
| ALT-LOG-02 | "On behalf of" banner | Inspect the dashboard after ALT-LOG-01 | "ℹ️ You are using this service on behalf of 9811100011 (logged in from alternate number 9822200022)" | 🔧 Pass |
| ALT-LOG-03 | Owner's cards visible | Inspect the card list | Owner's saved cards listed | 🔧 Pass |
| ALT-LOG-04 | Alternate can block a card | Tap Block on the owner's card | Full blocking panel with the owner's details | 📋 Not executed |
| ALT-ACC-01 | Alternate-number field is locked | Inspect Contact details | "Locked while logged in via alternate number" | 🔧 Pass |
| ALT-ACC-02 | **Alternate must not be able to delete the owner's cards** | As the alternate, use Delete on a saved card | Action unavailable | ❌ **Fail — BUG-08.** Edit and Delete are fully available to the alternate |
| ALT-ACC-03 | **Alternate must not be able to change the account email** | As the alternate, edit the email | Action unavailable, or requires the owner | ❌ **Fail — BUG-08.** Editable; changing it redirects all account notifications away from the owner |

### R5 negative paths — a non-alternate number signing in as *Alternate*

The branch that decides what "Alternate" means had no refusal case at all. These
four are the regression set for it.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| ALT-LOG-05 | **Own registered number submitted as *Alternate* must not damage the account** | On a paid account with a name, email, 1 saved card and a verified alternate: select *Alternate*, enter **your own registered number**, verify `1234`. Compare the stored record before and after | Refused with an explanation; the record is untouched | ❌→🔧 **Was: account destroyed (BUG-19).** `name`, `email`, `cards`, `paid`, `altPhone` all reset to blank. Fixed; retested → record byte-identical, clear refusal, stays on the login screen |
| ALT-LOG-06 | **Unrecognised number as *Alternate* must not create an account** | Select *Alternate*, enter a number nobody has nominated, verify `1234` | Refused; no new record, no welcome messages | ❌→🔧 **Was: registered as a new own account, "Registered" logged, welcome SMS + WhatsApp sent (BUG-20).** Fixed; retested → no record created |
| ALT-LOG-07 | **Unverified alternate must be refused** | Seed `altPhone` with `altVerified: false`; sign in on it as *Alternate* | Refused | ❌→🔧 **Was: full access granted (BUG-21).** Fixed; retested → refused |
| ALT-LOG-08 | **Two owners sharing one alternate** | Seed two paid accounts that both nominate `9877700077`; sign in on it as *Alternate* | Choose which account to act for | ❌ **Fail — BUG-22.** Silently lands on the first account only; the second owner's cards are unreachable and nothing indicates the account exists |
| ALT-LOG-09 | Regression: the genuine alternate still works | After the fix, sign in on a correctly verified alternate | Owner's dashboard with the "on behalf of" banner | 🔧 Pass |
| ALT-LOG-10 | Regression: own-number login unaffected | Sign in on an existing account as *Own* | Dashboard, no "on behalf of" banner | 🔧 Pass |
| ALT-LOG-11 | Regression: new-user signup unaffected | Sign in as *Own* with a never-seen number | Account created, Step 2 of 3 | 🔧 Pass |
| ALT-ACC-04 | Unknown alternate number | Superseded by ALT-LOG-06 | Refused; no account created | 🔧 Pass after fix |

---

## 8. R6 — Admin

Operator of the in-app console: banks, blocking templates, users, activity log,
feedback, OTP mode, email integrations, contact messages.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| ADM-AUT-01 | Admin number opens the console | Sign in with `9223548779`, OTP `1234` | Admin console loads | ✅ Pass |
| ADM-AUT-02 | **Console must not be reachable without admin credentials** | As any visitor, sign in with `9223548779` and `1234` | Refused | ❌ **Fail — BUG-04 (Critical).** Full admin granted. The number is a plain string in `app.js`; the OTP is `1234` for everyone; there is no server-side check on any console action |
| ADM-AUT-03 | Admin session is not restored on refresh | Enter the console, reload | Returns to login (`admin` is excluded from `bmcSession.VIEWS`) | 📋 Not executed |
| ADM-AUT-04 | Exit admin | Tap "Exit admin" | Returns to the login screen | 📋 Not executed |
| ADM-BNK-01 | Bank list renders | Open the Banks tab | All 10 banks with SMS numbers, formats, email, helplines | ✅ Pass |
| ADM-BNK-02 | Edit a bank's SMS number | Change a value, blur | Saved and written to the activity log | 📋 Not executed |
| ADM-BNK-03 | Verified toggle | Toggle "Verified" off | User-facing amber warning appears on that bank's block panel | 📋 Not executed |
| ADM-BNK-04 | Helplines parse as a list | Enter comma-separated numbers | Split into separate `tel:` entries | 📋 Not executed |
| ADM-TPL-01 | Edit a message template | Change welcome SMS text, blur | Saved; used on the next registration | 📋 Not executed |
| ADM-TPL-02 | Placeholders substitute | Use `{name}`, `{last4}`, `{bank}` | Replaced at send time | ✅ Pass (observed in simulated messages) |
| ADM-USR-01 | User list renders | Open the Users tab | Accounts with phone, name, paid badge, cards | ✅ Pass |
| ADM-USR-02 | **No internal records in the user list** | Inspect the Users tab | Only real accounts | ❌ **Fail — BUG-14.** `__no_demo__` placeholder is listed as a user |
| ADM-USR-03 | Edit a user's alternate number / email | Change a field, blur | Saved and logged | 📋 Not executed |
| ADM-USR-04 | Delete a user | Delete an account | Removed; logged | 📋 Not executed |
| ADM-LOG-01 | Activity log | Open Activity log | Timestamped OTP, login, payment and block events | ✅ Pass |
| ADM-OTP-01 | OTP mode toggle | OTP Mode tab → switch Live / Dummy | Toggles; purple "DUMMY OTP MODE" banner follows the setting | ✅ Pass |
| ADM-EML-01 | Email integrations need the admin key | Open Email Integrations without `x-admin-key` | 401 from `/api/email-settings` | ✅ Pass by inspection (`lib/admin-auth.js`) |
| ADM-MSG-01 | **Admin tab labels are unambiguous** | Read the tab strip | Every tab has a distinct name | ❌ **Fail — BUG-15.** Two tabs are both labelled "Messages" |

---

## 9. R7 — Unauthenticated API Client

No UI. This is what an attacker sees, and the row that matters most for a
service that holds card and identity data.

| ID | Title | Steps | Expected | Result |
|----|-------|-------|----------|--------|
| API-OTP-01 | `send-otp` rejects a malformed number | POST `{phone:"+911234567890"}` | 400 | ✅ Pass |
| API-OTP-02 | `send-otp` rate limit | 5 POSTs for one number | 4th and 5th → 429 | ✅ Pass — `200,200,200,429,429` |
| API-OTP-03 | **`verify-otp` must require a challenge from `send-otp`** | POST `{phone, otp:"1234", token:"garbage"}` with no prior send | Refused | ❌→🔧 **Was: 200 with a valid `phoneToken` for an arbitrary number (BUG-05).** The send rate limit was fully bypassable. Fixed; retested → `400 "Please tap Send OTP first."` |
| API-OTP-04 | Token cannot be replayed against another number | Issue a token for A, verify it against B | Refused | 🔧 Pass — `400 "Phone number mismatch."` |
| API-OTP-05 | Correct pairing succeeds | Verify a token against its own number with `1234` | 200 + `phoneToken` | 🔧 Pass |
| API-OTP-06 | Brute-force lockout | 7 wrong codes against one token | Locks out after 5 | 🔧 Pass — `400×5, 429, 429` |
| API-OTP-07 | Tampered token rejected | Flip a byte in the signature, verify | 401 / 400, never 200 | ✅ Pass by inspection (constant-time HMAC compare) |
| API-OTP-08 | OTP is not returned in the response | Read the `send-otp` body | No plaintext code | ✅ Pass — payload carries a phone-bound HMAC only |
| API-OTP-09 | **`1234` must not authenticate arbitrary numbers on production** | `send-otp` + `verify-otp` for a number you do not own | Refused | ❌ **Fail — BUG-03 (Critical).** Succeeds for any number. Accepted by the owner; every account is reachable by anyone who knows a number |
| API-DIR-01 | `user-directory` needs a phone token | POST an email with no `phoneToken` | 401 | ✅ Pass by inspection |
| API-DIR-02 | Phone comes from the token, not the body | POST a token for A with a body claiming B | Records against A | ✅ Pass by inspection |
| API-DIR-03 | Email format validated | POST `email:"nope"` | 400 | 📋 Not executed |
| API-EML-01 | **`login-email` must not act on an unsigned claim** | POST `{phone: <registered>, ts: <any>}` | Refused | ❌→🔧 **Was: sent a "Security alert: new sign-in" mail to the user's real address (BUG-07).** Fixed; retested → `sent:false, reason:"unverified"` |
| API-EML-02 | Email bombing | Repeat API-EML-01 with varying `ts` | No mail sent | 🔧 Pass after fix |
| API-EML-03 | Registered-number enumeration | Compare replies for a registered vs unregistered number | Indistinguishable | 🔧 Pass after fix — both return `unverified` before any lookup |
| API-STO-01 | `storage` refuses unknown keys | GET `/api/storage?key=otp:+9198...` | 404 "Unknown key" | ✅ Pass by inspection |
| API-STO-02 | `storage` returns nothing without a phone token | GET `?key=cbp:users` unauthenticated | Empty map | ✅ Pass — returns `{}` |
| API-STO-03 | **`storage` is actually used by the app** | Complete a full registration, inspect the network log | Reads and writes to `/api/storage` | ❌ **Fail — BUG-01 (Blocker).** Zero calls. The endpoint and its access-policy module are correct, tested-looking, and completely unwired |
| API-ADM-01 | Admin endpoints need `x-admin-key` | GET `/api/contact-messages` without the header | 403 | ✅ Pass by inspection |
| API-CNT-01 | Contact form rate limit | 6 POSTs to `/api/contact` from one IP | 6th → 429 | 📋 Not executed |
| API-CNT-02 | Honeypot | POST with `website` filled | 200, silently discarded | ✅ Pass by inspection |

---

## 10. Automation plan

The suite is written to be automated with **Playwright** against the dummy-OTP
configuration, which makes the whole authenticated surface reachable without an
SMS spend.

| Layer | Tool | Coverage | Notes |
|-------|------|----------|-------|
| API contract | Playwright `request` / supertest | R7 in full, plus R2's OTP cases | Fast, deterministic, no DOM. Highest value per line — start here |
| Unit | Vitest | `lib/otp-token`, `lib/phone-token`, `lib/otp-mode`, `lib/storage-policy`, `lib/contact` | Already pure functions with no I/O; `lib/storage-policy.js` in particular is written to be unit-testable and has no tests |
| E2E journeys | Playwright | R2 → R4 → R5 happy paths, R6 admin console | Seed state by writing `localStorage` directly to skip re-registration |
| Visual / responsive | Playwright screenshots | R1 at 375 / 768 / 1280, light and dark | Guards the DOM-bridge injections, which are the most breakage-prone code |
| Accessibility | axe-core via Playwright | R1 landing page and the card tool | Cases GST-A11Y-01..04 |

### Selector strategy — the important caveat

`otp-bridge.js`, `admin-otp-toggle.js` and `login-email-notifier.js` locate
elements by **exact button-label text** (`'Send OTP'`, `'Save & verify'`,
`'Banks'`, `'Skip — just log out'`). BUG-02, BUG-09 and BUG-10 are all direct
consequences. Two recommendations, in priority order:

1. **Add stable `data-testid` attributes** to the elements these bridges target
   and switch both the bridges and the tests to them. This removes a class of
   production defect, not just a class of test flake.
2. Until then, automate with the same text selectors the bridges use, so a copy
   change fails the suite loudly instead of silently breaking a user flow.

### Suggested CI gate

Run the API-contract and unit layers on every push; run E2E and visual on pull
requests to `main`. Treat any R7 failure as a release blocker.

---

## 11. Recommendation

Two items block a real launch, and neither is a code-quality problem:

**BUG-01 — wire up server-side storage.** `api/storage.js` and
`lib/storage-policy.js` already implement per-user rows, phone-token
authentication and both-directions filtering. Nothing calls them. Until a
`window.storage` implementation backed by that endpoint is defined **before**
`app.js` loads, the service cannot deliver the one thing it advertises: reaching
your card details from a phone that is not yours. Right now a customer who pays
₹50, loses their phone, and signs in from a friend's handset is silently handed
an empty new account.

**BUG-03 / BUG-04 — close dummy mode, then give the admin console real auth.**
Dummy mode being open is a recorded owner decision, and this report does not
override it. It should be understood for what it costs: `1234` is a master key
to every account, and because the admin number is a literal in the client
bundle, it is also a master key to the admin console. Flipping
`ALLOW_DUMMY_ON_PRODUCTION` to `false` in `lib/otp-mode.js` closes both, and the
`OTP_DUMMY_NUMBERS` allowlist keeps the demo accounts working.

The seven defects fixed in this pass are committed on
`fix/session-survives-refresh` and **are not live until that branch is deployed**.
