export default {
  async fetch(request) {
    const url = new URL(request.url);
    const xUrl = url.searchParams.get("url");

    if (!xUrl) {
      return new Response("Missing ?url= parameter", { status: 400 });
    }

    let data;
    try {
      const resp = await fetch("https://xtomd.com/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: xUrl }),
      });
      if (!resp.ok) {
        return new Response(`xtomd API error: ${resp.status}`, { status: 502 });
      }
      data = await resp.json();
    } catch (e) {
      return new Response(`Failed to fetch from xtomd: ${e.message}`, {
        status: 502,
      });
    }

    const title = data?.article?.title || "Untitled";
    const author = data?.author?.name || "";
    const blocks = data?.article?.blocks || [];

    const html = renderHtml(title, author, blocks);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

function applyInlineStyles(text, inlineStyleRanges) {
  if (!inlineStyleRanges || inlineStyleRanges.length === 0)
    return escapeHtml(text);

  // Build character-level style sets
  const chars = [...text];
  const styles = new Array(chars.length).fill(null).map(() => new Set());

  for (const range of inlineStyleRanges) {
    const { offset, length, style } = range;
    for (let i = offset; i < offset + length && i < chars.length; i++) {
      styles[i].add(style);
    }
  }

  // Render with open/close tags
  let result = "";
  let openTags = [];

  for (let i = 0; i <= chars.length; i++) {
    const currentStyles = i < chars.length ? styles[i] : new Set();
    const prevStyles = i > 0 ? styles[i - 1] : new Set();

    // Close tags that ended
    const toClose = [...openTags].filter((s) => !currentStyles.has(s));
    for (const s of toClose.reverse()) {
      result += styleTag(s, false);
      openTags = openTags.filter((x) => x !== s);
    }

    // Open new tags
    const toOpen = [...currentStyles].filter((s) => !prevStyles.has(s));
    for (const s of toOpen) {
      result += styleTag(s, true);
      openTags.push(s);
    }

    if (i < chars.length) {
      result += escapeHtml(chars[i]);
    }
  }

  return result;
}

function styleTag(style, open) {
  const tag = style === "BOLD" ? "strong" : style === "ITALIC" ? "em" : null;
  if (!tag) return "";
  return open ? `<${tag}>` : `</${tag}>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlock(block) {
  const text = applyInlineStyles(block.text, block.inlineStyleRanges);
  switch (block.type) {
    case "unstyled":
      return `<p>${text}</p>`;
    case "header-one":
      return `<h1>${text}</h1>`;
    case "header-two":
      return `<h2>${text}</h2>`;
    case "header-three":
      return `<h3>${text}</h3>`;
    case "ordered-list-item":
      return `<li data-list="ordered">${text}</li>`;
    case "unordered-list-item":
      return `<li data-list="unordered">${text}</li>`;
    case "atomic":
      return "";
    default:
      return `<p>${text}</p>`;
  }
}

function renderHtml(title, author, blocks) {
  let content = "";
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (
      block.type === "ordered-list-item" ||
      block.type === "unordered-list-item"
    ) {
      const tag = block.type === "ordered-list-item" ? "ol" : "ul";
      const items = [];
      while (i < blocks.length && blocks[i].type === block.type) {
        items.push(renderBlock(blocks[i]));
        i++;
      }
      content += `<${tag}>${items.join("")}</${tag}>`;
    } else if (block.type === "atomic") {
      i++;
    } else {
      content += renderBlock(block);
      i++;
    }
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
${author ? `<p><em>By ${escapeHtml(author)}</em></p>` : ""}
${content}
</body>
</html>`;
}
