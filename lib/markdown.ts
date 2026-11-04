// Minimal, deliberately small markdown renderer for MVP.
// Supports: # / ## / ### headings, **bold**, *italic*, `code`,
// fenced ``` code blocks, - / * lists, [text](url) links, paragraphs.
// It escapes HTML first, so author markdown cannot inject markup.
// This is NOT a full CommonMark parser. If richer rendering is needed,
// swap this function for a maintained library (e.g. marked + sanitize)
// without changing the lesson content shape.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = (md ?? "").split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length > 0) {
      html.push(`<ul>${listBuf.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
      listBuf = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      listBuf.push(listMatch[1]);
      continue;
    }
    flushList();
    if (line.startsWith("### ")) {
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.trim() === "") {
      // paragraph break, nothing to emit
    } else {
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  flushList();
  return html.join("\n");
}
