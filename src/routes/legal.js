// src/routes/legal.js
// Serves the privacy policy and terms as public HTML pages (no auth). These
// give the App Store / Play Store the reachable URLs they require:
//   https://yourdomain.com/privacy   and   /terms
// The content is read from the PRIVACY.md / TERMS.md files in the repo root and
// rendered with a tiny markdown-to-HTML pass (headings, bold, paragraphs, lists).

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", ".."); // repo root

const router = express.Router();

// Minimal, safe markdown → HTML. Escapes HTML first, then applies a small set
// of markdown rules. Enough for our policy docs; not a general renderer.
function mdToHtml(md) {
  const esc = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lines = esc(md).split("\n");
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>\n";
      inList = false;
    }
  };

  for (let raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^### /.test(line)) {
      closeList();
      html += `<h3>${inline(line.slice(4))}</h3>\n`;
    } else if (/^## /.test(line)) {
      closeList();
      html += `<h2>${inline(line.slice(3))}</h2>\n`;
    } else if (/^# /.test(line)) {
      closeList();
      html += `<h1>${inline(line.slice(2))}</h1>\n`;
    } else if (/^\s*[-*] /.test(line)) {
      if (!inList) {
        html += "<ul>\n";
        inList = true;
      }
      html += `<li>${inline(line.replace(/^\s*[-*] /, ""))}</li>\n`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>\n`;
    }
  }
  closeList();
  return html;

  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
}

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6;
         max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 1.7rem; } h2 { font-size: 1.25rem; margin-top: 2rem; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 4px; }
  a { color: #2d4a6e; }
</style>
</head><body>
${bodyHtml}
</body></html>`;
}

function serveDoc(fileName, title) {
  return (req, res) => {
    try {
      const md = fs.readFileSync(path.join(ROOT, fileName), "utf8");
      res.type("html").send(page(title, mdToHtml(md)));
    } catch {
      res.status(404).type("text").send(`${title} not found.`);
    }
  };
}

router.get("/privacy", serveDoc("PRIVACY.md", "Privacy Policy — Linux Lab"));
router.get("/terms", serveDoc("TERMS.md", "Terms of Service — Linux Lab"));

export default router;
