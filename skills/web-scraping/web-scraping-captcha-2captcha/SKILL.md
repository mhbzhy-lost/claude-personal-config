---
name: web-scraping-captcha-2captcha
description: 2Captcha human-powered CAPTCHA solving API — submit, poll, inject for reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, FunCaptcha, and image captchas.
tech_stack: [http]
language: [python, javascript]
capability: [auth]
version: "2Captcha API v1"
collected_at: 2025-01-01
---

# 2Captcha CAPTCHA Solving API

> Source: https://2captcha.com/2captcha-api, https://playwright.dev/python/docs/auth

## Purpose
2Captcha is a human-powered CAPTCHA recognition service with an HTTP API. You submit a captcha (image or site parameters), human workers solve it in 15–45 seconds, and you poll for the solution token to inject into your browser session. It covers the full spectrum of CAPTCHA types encountered in web scraping.

## When to Use
- Target site presents reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, or FunCaptcha that blocks automated access.
- Image-based CAPTCHAs that OCR cannot reliably decode.
- Need programmatic CAPTCHA solving integrated into a Playwright-based scraping pipeline.
- Need callback-based (pingback) solving to avoid polling overhead.
- Need to report incorrect solutions for refunds (reportGood/reportBad).

## Basic Usage

### Core workflow (applies to ALL captcha types)

```python
import requests
import time

API_KEY = "YOUR_32_CHAR_API_KEY"

# 1. SUBMIT — type-specific parameters
resp = requests.post("https://2captcha.com/in.php", data={
    "key": API_KEY,
    "method": "userrecaptcha",          # captcha type
    "googlekey": "SITE_KEY",            # from data-sitekey on page
    "pageurl": "https://target.com/page",
    "json": 1
})
captcha_id = resp.json()["request"]     # {"status":1,"request":"2122988149"}

# 2. POLL — wait initial delay, then loop
time.sleep(20)  # 20s for reCAPTCHA; 5s for image/text captchas
while True:
    resp = requests.get("https://2captcha.com/res.php", params={
        "key": API_KEY,
        "action": "get",
        "id": captcha_id,
        "json": 1
    })
    if resp.json()["status"] == 1:
        token = resp.json()["request"]  # the solution
        break
    time.sleep(5)                       # poll every 5s

# 3. INJECT — into Playwright page
await page.evaluate(f'''
    document.getElementById("g-recaptcha-response").innerHTML = "{token}";
    ___grecaptcha_cfg.clients[0].aa.l.callback("{token}");
''')
```

### reCAPTCHA V2
```python
# Submit
requests.post("https://2captcha.com/in.php", data={
    "key": API_KEY,
    "method": "userrecaptcha",
    "googlekey": "6Le-wvkS...",         # from data-sitekey or k= param
    "pageurl": "https://example.com/page",
    "invisible": 1,                      # only for invisible reCAPTCHA
})
```

### hCaptcha
```python
requests.post("https://2captcha.com/in.php", data={
    "key": API_KEY,
    "method": "hcaptcha",
    "sitekey": "10000000-ffff-...",
    "pageurl": "https://example.com",
})
```

### Cloudflare Turnstile
```python
requests.post("https://2captcha.com/in.php", data={
    "key": API_KEY,
    "method": "turnstile",
    "sitekey": "0x4AAAAAAAA...",
    "pageurl": "https://example.com",
})
```

### Image Captcha (multipart)
```python
resp = requests.post("https://2captcha.com/in.php", 
    files={"file": open("captcha.png", "rb")},
    data={"key": API_KEY, "method": "post"}
)
```

## Key APIs (Summary)

| Endpoint / Action | Purpose |
|-------------------|---------|
| `POST /in.php` | Submit captcha. Returns `OK|<id>` or `{"status":1,"request":"<id>"}` |
| `GET /res.php?action=get&id=<id>` | Poll for solution. Returns `OK|<answer>` or `CAPCHA_NOT_READY` |
| `GET /res.php?action=reportgood&id=<id>` | Report correct solution (improves accuracy). |
| `GET /res.php?action=reportbad&id=<id>` | Report incorrect solution (triggers refund). |
| Pingback (callback) | Register URL to receive `POST` callback when solved — no polling needed. |

### Method table (common CAPTCHA types)

| `method=` value | CAPTCHA type | Key required params |
|-----------------|--------------|---------------------|
| `userrecaptcha` | reCAPTCHA V2 | `googlekey`, `pageurl` |
| `userrecaptcha` + `version=v3` | reCAPTCHA V3 | `googlekey`, `pageurl`, `action` |
| `hcaptcha` | hCaptcha | `sitekey`, `pageurl` |
| `turnstile` | Cloudflare Turnstile | `sitekey`, `pageurl` |
| `funcaptcha` | FunCaptcha | `publickey`, `pageurl` |
| `geetest` / `geetest_v4` | Geetest v3/v4 | `gt`, `challenge`, `pageurl` |
| `post` / `base64` | Image captcha | `file` or `body` (base64) |

### Token injection patterns (Playwright)

```python
# Pattern A: Hidden textarea (most common for reCAPTCHA)
await page.evaluate(f'''
    document.getElementById("g-recaptcha-response").innerHTML = "{token}";
''')
await page.click("#submit-button")

# Pattern B: Callback function (no submit button)
await page.evaluate(f'''
    ___grecaptcha_cfg.clients[0].aa.l.callback("{token}");
''')

# Pattern C: Find callback from data-callback attribute
callback_name = await page.get_attribute("#recaptcha-widget", "data-callback")
await page.evaluate(f"{callback_name}('{token}')")
```

## Caveats
- **Latency**: 15–45 second solve time is inherent (human workers). Design pipelines with `asyncio` or threading for parallel solves.
- **Cost**: Per-solve pricing varies by CAPTCHA type. reCAPTCHA is cheapest; complex types (Geetest, DataDome) cost more.
- **Invisible reCAPTCHA**: Must pass `invisible=1`. Detect it via iframe `size=invisible`, `___grecaptcha_cfg.clients[0].aa.l.size === "invisible"`, or absence of visible checkbox.
- **Hidden textarea**: `#g-recaptcha-response` may have `display:none` — remove that style or use JS assignment (which works regardless).
- **Proxy matching**: Use a proxy in the same geographic region as the captcha for higher success rates.
- **Duplicate limit**: Max 10 submissions of the same captcha image; server returns `ERROR_BAD_DUPLICATES`.
- **Image format**: Only JPG, JPEG, GIF, PNG; 100 bytes to 100 KB.
- **reportGood timing**: Must call `reportgood` within reasonable time after receiving solution; late reports get `ERROR_TOKEN_EXPIRED`.
- **Zero balance**: `ERROR_ZERO_BALANCE` — top up account before submitting.

## Composition Hints
- **With Playwright stealth**: Launch Playwright (or Patchright), detect CAPTCHA on page, submit to 2Captcha, inject token, and continue the browser flow (combine with `web-scraping-playwright-stealth-patchright`).
- **With session persistence**: After CAPTCHA solve + login, save Playwright `storage_state` to skip captchas on subsequent runs (combine with `web-scraping-session-state-persistence`).
- **With auto-relogin**: If a session expires and a CAPTCHA gate reappears, trigger 2Captcha solve as part of the self-healing relogin flow (combine with `web-scraping-auto-relogin-pattern`).
- **With multi-step forms**: Insert CAPTCHA solving as a dedicated state-machine step between form-page and form-submit (combine with `web-scraping-multi-step-form-flow`).
- **Parallel solves**: For pages with multiple CAPTCHAs, use `asyncio.gather` with multiple 2Captcha submissions to solve them concurrently.
