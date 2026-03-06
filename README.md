# obsidian-redirect

Two things in one Cloudflare Worker:

1. **Deep links** — make `obsidian://` URIs clickable in Telegram, Discord, Slack, and any chat app that only hyperlinks `https://` URLs
2. **Public note sharing** — publish Obsidian notes as clean, readable web pages

Deploy in ~5 minutes. Runs on Cloudflare's free tier.

## Quick Start

1. **Fork** [gisk0/obsidian-redirect](https://github.com/gisk0/obsidian-redirect)

2. **Configure your domain** — edit `wrangler.toml`:

   ```toml
   routes = [
     { pattern = "obs.yourdomain.com/*", zone_name = "yourdomain.com" }
   ]
   ```

3. **Set a publish token** — used to authenticate the management API:

   ```bash
   npx wrangler secret put PUBLISH_TOKEN
   # enter a strong random string, e.g.: openssl rand -hex 32
   ```

4. **Deploy:**

   ```bash
   npm install
   npx wrangler login        # authenticate with Cloudflare
   npm run deploy
   ```

5. **Verify:**
   ```bash
   curl https://obs.yourdomain.com/health   # → 200 "ok"
   ```

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

```
https://obs.yourdomain.com/<VaultName>/<encoded-file-path>
```

- Encode `/` in the file path as `%2F`
- Omit the `.md` extension (Obsidian resolves it)

**Examples:**

```
https://obs.yourdomain.com/MyVault/projects%2Fmy-project%2Fplan
https://obs.yourdomain.com/MyVault/notes%2F2026-02-22-meeting
```

**Markdown syntax for chat apps:**

```markdown
[📄 plan](https://obs.yourdomain.com/MyVault/projects%2Fmy-project%2Fplan)
```

**Passthrough (arbitrary parameters):**

```
https://obs.yourdomain.com/open?vault=MyVault&file=path%2Fto%2Fnote
```

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

```
https://obs.yourdomain.com/s/<slug>
```

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
```

Response:

```json
{ "ok": true, "slug": "my-note", "url": "/s/my-note" }
```

Re-publishing to an existing slug updates the content and preserves the original `publishedAt` date.

**Slug rules:** lowercase letters, numbers, and hyphens only (`a-z0-9-`), max 128 chars.

### Unpublishing a note

```bash
curl -X DELETE https://obs.yourdomain.com/api/publish/my-note \
  -H "X-Publish-Token: <your-token>"
```

This also deletes all images associated with the note.

### Listing published notes

```bash
curl https://obs.yourdomain.com/api/published \
  -H "X-Publish-Token: <your-token>"
```

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
```

Supported types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. Max size: 10 MB.

**Reference in markdown:**

```markdown
![alt text](img/screenshot.png)
```

The Worker rewrites these to the correct public URL at render time.

**Served at:**

```
https://obs.yourdomain.com/s/<slug>/img/<filename>
```

Served with `Cache-Control: immutable` (1 year).

**Delete an image:**

```bash
curl -X DELETE https://obs.yourdomain.com/api/image/my-note/screenshot.png \
  -H "X-Publish-Token: <your-token>"
```

**List images for a note:**

```bash
curl https://obs.yourdomain.com/api/images/my-note \
  -H "X-Publish-Token: <your-token>"
```

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
```

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
```

---

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript, ~500 lines)
- **Storage:** Cloudflare Workers KV (notes + images)
- **Rendering:** `marked` (Markdown → HTML) + allowlist-based HTML sanitizer
- **Security:** Token-authenticated API, XSS-safe HTML rendering, URL scheme allowlist on links/images, SVG excluded from image uploads
- **Infra:** Optional Terraform (OpenTofu) config in `terraform/`
- **Cost:** ~$0/mo on Cloudflare free tier (KV: 100k reads/day, 1k writes/day)
