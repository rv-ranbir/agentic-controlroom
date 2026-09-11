export interface AgentPresentation {
  title: string;
  summary: string;
  html: string;
}

interface ParseResult {
  dataReply: string;
  presentation?: AgentPresentation;
}

const FENCED_JSON_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
const TITLE_MAX = 200;
const SUMMARY_MAX = 2000;
const HTML_MAX = 256 * 1024;

function validatePresentation(obj: unknown): AgentPresentation {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('invalid presentation: not an object');
  }
  const p = obj as Record<string, unknown>;
  if (!('title' in p) || !('summary' in p) || !('html' in p)) {
    throw new Error('invalid presentation: missing required fields title, summary, or html');
  }
  const { title, summary, html } = p;
  if (typeof title !== 'string') {
    throw new Error('invalid presentation: title must be string');
  }
  if (!title.trim()) {
    throw new Error('invalid presentation: title cannot be empty');
  }
  if (title.length > TITLE_MAX) {
    throw new Error(`invalid presentation: title exceeds ${TITLE_MAX} characters`);
  }
  if (typeof summary !== 'string') {
    throw new Error('invalid presentation: summary must be string');
  }
  if (!summary.trim()) {
    throw new Error('invalid presentation: summary cannot be empty');
  }
  if (summary.length > SUMMARY_MAX) {
    throw new Error(`invalid presentation: summary exceeds ${SUMMARY_MAX} characters`);
  }
  if (typeof html !== 'string') {
    throw new Error('invalid presentation: html must be string');
  }
  if (!html.trim()) {
    throw new Error('invalid presentation: html cannot be empty');
  }
  if (Buffer.byteLength(html, 'utf8') > HTML_MAX) {
    throw new Error(`invalid presentation: html exceeds ${HTML_MAX} bytes`);
  }
  return { title, summary, html };
}

export function parsePresentation(reply: string): ParseResult {
  const fencedMatch = reply.trim().match(FENCED_JSON_RE);
  const jsonText = fencedMatch ? fencedMatch[1] : reply;
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    if(fencedMatch)throw new Error('invalid presentation: malformed JSON in fence');
    return {dataReply:reply};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { dataReply: reply };
  }
  const obj = data as Record<string, unknown>;
  if (!('presentation' in obj)) {
    return { dataReply: reply };
  }
  const presentation = validatePresentation(obj.presentation);
  const { presentation: _, ...dataWithoutPresentation } = obj;
  return {
    dataReply: JSON.stringify(dataWithoutPresentation),
    presentation,
  };
}

function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const OUTER_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'self' data:";
const INNER_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";

export function inlinePresentation(html:string,title:string):string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${INNER_CSP}">
<title>${escapeHtmlContent(title)}</title>
</head>
<body>
${html}
</body>
</html>`;

}

export function wrapPresentation(html:string,title:string):string {
  const escapedTitle=escapeHtmlAttr(title);
  const escapedSrcdoc = escapeHtmlAttr(inlinePresentation(html,title));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${OUTER_CSP}">
<title>${escapedTitle}</title>
<style>
body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
iframe { width: 100%; height: 100vh; border: none; display: block; }
</style>
</head>
<body>
<iframe sandbox="allow-scripts" srcdoc="${escapedSrcdoc}"></iframe>
</body>
</html>`;
}
