# obsidian-redirect

Three Cloudflare Workers on `gisk0.dev`:

1. **Deep links** (`obs.gisk0.dev`) — make `obsidian://` URIs clickable in Telegram, Discord, Slack, and any chat app that only hyperlinks `https://` URLs
2. **Public note sharing** (`obs.gisk0.dev`) — publish Obsidian notes as clean, readable web pages
3. **X Reader** (`xread.gisk0.dev`) — convert X (Twitter) posts, threads, and articles into clean readable HTML for Instapaper and other read-later services

All run on Cloudflare's free tier.

## Quick Start

1. **Fork** [gisk0/obsidian-redirect](https://github.com/gisk0/obsidian-redirect)

2. **Configure your domain** — edit `wrangler.toml`:

   ```toml
   routes = [
     { pattern = "obs.yourdomain.com/*", zone_name = "yourdomain.com" }
   ]
   ```

````text

3. **Set a publish token** — used to authenticate the management API:

   ```bash
   npx wrangler secret put PUBLISH_TOKEN
   # enter a strong random string, e.g.: openssl rand -hex 32
```text

4. **Deploy:**

   ```bash
   npm install
   npx wrangler login        # authenticate with Cloudflare
   npm run deploy
```text

5. **Verify:**
   ```bash
   curl https://obs.yourdomain.com/health   # → 200 "ok"
```text

### CI/CD (optional)

After the first manual deploy, pushes to `main` auto-deploy via GitHub Actions.

Add two GitHub secrets:

| Secret          | Value                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CF_API_TOKEN`  | Cloudflare API token — [create here](https://dash.cloudflare.com/profile/api-tokens), use the **Edit Cloudflare Workers** template |
| `PUBLISH_TOKEN` | Same value you set with `wrangler secret put`                                                                                      |

---

## Feature 1 — Obsidian Deep Links

Make vault links tappable in any chat app.

### URL format

```text
https://obs.yourdomain.com/<VaultName>/<encoded-file-path>
```text

- Encode `/` in the file path as `%2F`
- Omit the `.md` extension (Obsidian resolves it)

**Examples:**

```text
https://obs.yourdomain.com/MyVault/projects%2Fmy-project%2Fplan
https://obs.yourdomain.com/MyVault/notes%2F2026-02-22-meeting
```text

**Markdown syntax for chat apps:**

```markdown
[📄 plan](https://obs.yourdomain.com/MyVault/projects%2Fmy-project%2Fplan)
```text

**Passthrough (arbitrary parameters):**

```text
https://obs.yourdomain.com/open?vault=MyVault&file=path%2Fto%2Fnote
```text

Parameters are forwarded verbatim to `obsidian://open?...`.

### How it works

Chat apps like Telegram only hyperlink `http://` and `https://` URLs — `obsidian://` URIs render as plain text. Worse, Telegram's iOS in-app browser (WKWebView) blocks script-initiated navigation to custom URI schemes, so even a server-side 302 redirect silently fails on iOS.

The Worker serves an HTML page with:

- A **"Open in Obsidian →" button** — user-initiated taps pass WKWebView's security checks (iOS)
- A **JS auto-redirect** — fires immediately on macOS/desktop for zero-friction UX

| Platform  | Experience                                                       |
| --------- | ---------------------------------------------------------------- |
| **macOS** | Click link → browser flashes → Obsidian opens instantly          |
| **iOS**   | Tap link → "Open in Obsidian" page → tap button → Obsidian opens |

The extra tap on iOS is unavoidable — it's a WKWebView security constraint. Obsidian doesn't support Universal Links.

---

## Feature 2 — Public Note Sharing

Publish any Obsidian note as a public web page. No extra infrastructure — everything is stored in Cloudflare KV.

### Published note URL

```text
https://obs.yourdomain.com/s/<slug>
```text

Notes are rendered as clean, readable HTML with proper typography, code highlighting styles, tables, and image support.

### Publishing a note

```bash
curl -X PUT https://obs.yourdomain.com/api/publish \
  -H "X-Publish-Token: <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-note",
    "title": "My Note Title",
    "markdown": "# Hello\n\nThis is my note."
  }'
```text

Response:

```json
{ "ok": true, "slug": "my-note", "url": "/s/my-note" }
```text

Re-publishing to an existing slug updates the content and preserves the original `publishedAt` date.

**Slug rules:** lowercase letters, numbers, and hyphens only (`a-z0-9-`), max 128 chars.

### Unpublishing a note

```bash
curl -X DELETE https://obs.yourdomain.com/api/publish/my-note \
  -H "X-Publish-Token: <your-token>"
```text

This also deletes all images associated with the note.

### Listing published notes

```bash
curl https://obs.yourdomain.com/api/published \
  -H "X-Publish-Token: <your-token>"
```text

### Images

You can upload images and reference them in your note's markdown.

**Upload an image:**

```bash
curl -X PUT https://obs.yourdomain.com/api/image \
  -H "X-Publish-Token: <your-token>" \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\": \"my-note\",
    \"filename\": \"screenshot.png\",
    \"contentType\": \"image/png\",
    \"data\": \"$(base64 -i screenshot.png)\"
  }"
```text

Supported types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. Max size: 10 MB.

**Reference in markdown:**

```markdown
![alt text](img/screenshot.png)
```text

The Worker rewrites these to the correct public URL at render time.

**Served at:**

```text
https://obs.yourdomain.com/s/<slug>/img/<filename>
```text

Served with `Cache-Control: immutable` (1 year).

**Delete an image:**

```bash
curl -X DELETE https://obs.yourdomain.com/api/image/my-note/screenshot.png \
  -H "X-Publish-Token: <your-token>"
```text

**List images for a note:**

```bash
curl https://obs.yourdomain.com/api/images/my-note \
  -H "X-Publish-Token: <your-token>"
```text

---

## Configuration

### `wrangler.toml`

```toml
name = "obsidian-redirect"
main = "src/index.ts"
compatibility_date = "2024-01-01"

routes = [
  { pattern = "obs.yourdomain.com/*", zone_name = "yourdomain.com" }
]

[[kv_namespaces]]
binding = "PUBLISHED_NOTES"
id = "<your-kv-namespace-id>"
```text

The Workers Route automatically creates the necessary DNS records.

### Secrets

| Secret          | Purpose                                       |
| --------------- | --------------------------------------------- |
| `PUBLISH_TOKEN` | Bearer token for all management API endpoints |

Set via `npx wrangler secret put PUBLISH_TOKEN`.

### Custom domain requirements

- Domain must be on Cloudflare (proxied through their nameservers)
- The `zone_name` must match your Cloudflare zone

---

## Local Development

```bash
npm run dev   # starts wrangler dev server at http://localhost:8787
```text

---

---

## Feature 3 — X Reader (`xread.gisk0.dev`)

Convert any X post, thread, or article into clean readable HTML — with full text and images. Built for saving to Instapaper (or any read-later service).

### How it works (X Reader)

1. Shortcut shares an X URL to the worker
2. Worker fetches content via [wallabax](https://wallabax.vercel.app) (bypasses X's JS wall)
3. Returns clean HTML that Instapaper can parse and render

### Endpoints

**Get readable HTML:**

```text
GET https://xread.gisk0.dev/?url=https://x.com/user/status/123
```text

**Save to Instapaper directly:**

```text
GET https://xread.gisk0.dev/save?username=you%40email.com&password=yourpass&url=https://x.com/user/status/123
```text

Returns `200 Saved` on success.

### iOS Shortcut setup

3-step shortcut with Share Sheet enabled:

1. **Get Contents of URL** → `https://xread.gisk0.dev/save?username=YOUR_EMAIL&password=YOUR_PASS&url=` + Shortcut Input
2. **Show Notification** → `✅ Saved to Instapaper`

> Append Shortcut Input **raw** (no URL encode step) — the worker handles double-encoding from iOS automatically.

### Limitations

- Wallabax has a 100 req/day free tier limit (resets daily) — fine for personal use
- Images from `pbs.twimg.com` may not display in Instapaper's reader mode (Twitter hotlink protection). The HTML is correct; it's a Twitter-side restriction.

---

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript, ~500 lines)
- **Storage:** Cloudflare Workers KV (notes + images)
- **Rendering:** `marked` (Markdown → HTML) + allowlist-based HTML sanitizer
- **Security:** Token-authenticated API, XSS-safe HTML rendering, URL scheme allowlist on links/images, SVG excluded from image uploads
- **Infra:** Optional Terraform (OpenTofu) config in `terraform/`
- **Cost:** ~$0/mo on Cloudflare free tier (KV: 100k reads/day, 1k writes/day)
````
