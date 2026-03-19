export default {
  async fetch(request) {
    const url = new URL(request.url);
    const xUrl = url.searchParams.get("url");

    if (!xUrl) {
      return new Response("Missing ?url= parameter", { status: 400 });
    }

    // iOS Shortcuts double-encodes URLs — detect and fix
    const decodedOnce = decodeURIComponent(xUrl);
    const finalUrl = decodedOnce.startsWith("http") ? decodedOnce : xUrl;

    // /save route: fetch content then save to Instapaper server-side
    const isSave = url.pathname === "/save";
    const instaUser = url.searchParams.get("username");
    const instaPass = url.searchParams.get("password");

    // Fetch from wallabax — returns cleaned_html with real image URLs
    let html;
    try {
      const resp = await fetch("https://wallabax.vercel.app/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: finalUrl }),
      });
      if (!resp.ok) {
        return new Response(`wallabax API error: ${resp.status}`, {
          status: 502,
        });
      }
      const data = await resp.json();
      const title = data?.article?.title || "Untitled";
      const author = data?.article?.author || "";
      const cleanedHtml = data?.article?.cleaned_html || "<p>No content</p>";

      // Wrap in a proper HTML document
      html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
${author ? `<p><em>By ${escapeHtml(author)}</em></p>` : ""}
${cleanedHtml}
</body>
</html>`;
    } catch (e) {
      return new Response(`Failed to fetch: ${e.message}`, { status: 502 });
    }

    if (isSave && instaUser && instaPass) {
      const readerUrl = `https://xread.gisk0.dev/?url=${encodeURIComponent(finalUrl)}`;
      const instaUrl = `https://www.instapaper.com/api/add?username=${encodeURIComponent(instaUser)}&password=${encodeURIComponent(instaPass)}&url=${encodeURIComponent(readerUrl)}`;
      try {
        const instaResp = await fetch(instaUrl);
        if (instaResp.status === 201 || instaResp.status === 200) {
          return new Response("Saved", { status: 200 });
        }
        return new Response(`Instapaper error: ${instaResp.status}`, {
          status: 502,
        });
      } catch (e) {
        return new Response(`Failed to save to Instapaper: ${e.message}`, {
          status: 502,
        });
      }
    }

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
