---
name: web-scraping-totp-2fa
description: PyOTP TOTP integration with Google/Microsoft Authenticator shared secrets — auto-generate 2FA codes and auto-fill via Playwright with clock-skew tolerance.
tech_stack: [web-scraping]
language: [python]
capability: [auth]
version: "PyOTP 2.9.0 / Playwright unversioned"
collected_at: 2025-01-01
---

# TOTP 2FA Automation

> Source: https://pyauth.github.io/pyotp/, https://playwright.dev/python/docs/auth

## Purpose
Use PyOTP to generate Time-based One-Time Passwords (TOTP, RFC 6238) from a shared base32 secret — the same secret provisioned into Google Authenticator, Microsoft Authenticator, or Authy. Combine with Playwright to automate the full login + 2FA flow, then persist the authenticated session for scraping.

## When to Use
- Target system requires TOTP-based 2FA as a second factor after password login.
- You have access to the shared secret (e.g., from IT provisioning or QR code extraction).
- Session cookies expire and re-login with 2FA must run periodically in an automated pipeline.
- Counter-based HOTP (RFC 4226) tokens are needed (rarer, enterprise/HW token scenarios).

## Basic Usage

### Core Pattern: Secret → TOTP Code → Playwright Auto-Fill

```python
import os
import pyotp
from playwright.sync_api import sync_playwright

TOTP_SECRET = os.environ["TOTP_SECRET"]     # base32, e.g. "JBSWY3DPEHPK3PXP"
totp = pyotp.TOTP(TOTP_SECRET)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()

    # Step 1: credentials
    page.goto("https://internal.example.com/login")
    page.get_by_label("Email").fill(os.environ["USER"])
    page.get_by_label("Password").fill(os.environ["PASS"])
    page.get_by_role("button", name="Next").click()

    # Step 2: 2FA
    page.wait_for_selector("input[type='tel']")
    page.get_by_placeholder("Enter code").fill(totp.now())
    page.get_by_role("button", name="Verify").click()

    # Step 3: persist
    page.wait_for_url("**/home")
    context.storage_state(path="auth_state.json")
    browser.close()
```

### Extracting the Secret from a QR Code Image

```python
# pip install pillow pyzbar
from PIL import Image
from pyzbar.pyzbar import decode

img = Image.open("totp_qr.png")
uri = decode(img)[0].data.decode("utf-8")   # => 'otpauth://totp/...'
otp = pyotp.parse_uri(uri)
print(otp.now())
```

### Clock-Skew Tolerance

```python
totp = pyotp.TOTP(secret)
code = totp.now()

if not totp.verify(code):
    # Retry with ±2 intervals of tolerance (~±60s)
    if totp.verify(code, valid_window=2):
        pass  # clock skew accommodated
```

### Waiting for Code Rotation Boundary

```python
import datetime, time

# If current code is near expiry, wait for the next one
remaining = totp.interval - datetime.datetime.now().timestamp() % totp.interval
if remaining < 5:       # less than 5 seconds left
    time.sleep(remaining + 1)   # wait past rotation, then generate fresh
code = totp.now()
```

## Key APIs (Summary)

| API | Signature | Role |
|-----|-----------|------|
| `pyotp.TOTP(secret)` | `TOTP(s, digits=6, interval=30, digest=hashlib.sha1)` | Create TOTP handler from base32 secret |
| `totp.now()` | `() -> str` | Generate current 6-digit OTP |
| `totp.verify(otp, valid_window=0)` | `(str, int) -> bool` | Validate OTP with optional clock-skew tolerance |
| `totp.at(for_time)` | `(int \| datetime) -> str` | Generate OTP for a specific timestamp |
| `totp.provisioning_uri(name, issuer_name)` | `(str, str) -> str` | Build `otpauth://` URI for QR code |
| `pyotp.parse_uri(uri)` | `(str) -> TOTP \| HOTP` | Parse `otpauth://` URI back to OTP object |
| `pyotp.random_base32()` | `() -> str` | Generate 32-char base32 secret |
| `pyotp.HOTP(secret)` | `HOTP(s, digits=6, initial_count=0)` | Counter-based OTP handler |
| `hotp.at(counter)` | `(int) -> str` | Generate OTP for a counter value |
| Playwright `page.fill(selector, code)` | — | Type the OTP into the 2FA input field |

## Caveats
- **Secret security is paramount** — if an attacker gets the base32 secret, they can generate valid OTPs at any time. Store in env vars, a vault, or encrypted config — never in source code.
- **Clock skew breaks TOTP** — codes are valid for only one 30-second window by default. Ensure NTP sync on the machine running PyOTP. Use `valid_window=1` or `2` as a safety margin.
- **Never reuse a code** within the same interval — the server should reject replays. PyOTP can't enforce this server-side concern.
- **Rate-limit retries** — brute-forcing 2FA triggers account lockout on most systems. Wait ≥5 seconds between failed attempts.
- **TOTP vs HOTP** — consumer MFA apps (Google Authenticator, Authy, Microsoft Authenticator) use TOTP. HOTP requires tracking a persistent counter; only use it if you're certain the target uses counter-based tokens.
- **Some login pages detect headless browsers** — keep `headless=False` during 2FA flow development. Use `patchright` (stealth Playwright) for production.
- **`state.json` contains live session cookies** — add `playwright/.auth/` to `.gitignore`.
- **Secret format is base32** — if yours is hex or raw bytes, convert before passing to PyOTP.

## Composition Hints
- Compose with **sso-oauth-extraction** when the SSO flow also includes a 2FA step — run TOTP generation between credential fill and token extraction.
- Compose with **session-state-persistence** to cache the post-2FA `storage_state` JSON in encrypted form with expiry detection.
- Compose with **auto-relogin-pattern** so that when the session expires, the relogin decorator automatically replays credentials + TOTP to obtain a fresh session.
- Compose with **playwright-stealth-patchright** if the login page uses anti-bot detection that triggers additional verification challenges.
- For QR code extraction at scale, consider pre-extracting the `otpauth://` URI once and storing only the base32 secret — no need to decode the QR every run.
