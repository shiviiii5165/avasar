/**
 * Everything collected from a source is UNTRUSTED DATA. This module turns it into plain, bounded text:
 *  - HTML is reduced to text (scripts, styles and comments dropped; no markup survives). Avsar renders it as
 *    React text, never as HTML, so even text that looks like markup is inert.
 *  - Control, zero-width and bidirectional-override characters are removed (they hide or reorder text).
 *  - Lengths are capped.
 *  - Instruction-like phrases are FLAGGED for review (not silently removed): a job description must never be able
 *    to instruct an AI feature or a reviewer, and the flag keeps the listing out of publication until a person looks.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", rupee: "₹" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// C0/C1 controls (except tab/newline), zero-width, bidi embedding/override/isolate, BOM.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function cleanText(input: unknown, max = 20_000): string {
  if (typeof input !== "string") return "";
  return input.replace(INVISIBLE, "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/** HTML → plain text. Block elements become line breaks; everything else is dropped. Entities are decoded once, after tags are gone. */
export function htmlToText(html: unknown, max = 20_000): string {
  if (typeof html !== "string") return "";
  const text = html
    .slice(0, 2_000_000)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|iframe|object|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<[^>]*>/g, " ")
    .replace(/<|>/g, " ");
  // Entity-encoded markup ("&lt;script&gt;") decodes into tag-shaped text: strip that too, so no consumer
  // (an export, an email, a future HTML renderer) ever receives markup from a source.
  return cleanText(decodeEntities(text).replace(/<\/?[a-z!?][^<>]*>/gi, " "), max);
}

/** One-line field (title, employer, location): no newlines, short. */
export function cleanLine(input: unknown, max = 200): string {
  return cleanText(typeof input === "string" ? htmlToText(input, max * 2) : "", max * 2).replace(/\s*\n\s*/g, " ").slice(0, max).trim();
}

const INJECTION_PATTERNS: [RegExp, string][] = [
  [/\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|all|earlier|system)\b.{0,30}\b(instructions?|prompts?|rules?|messages?)/i, "instruction_override"],
  // Instructions aimed at an AI, not job text that mentions AI ("experience writing system prompts" is a real skill).
  [/\byou are now (an? )?(ai|assistant|language model|chatbot|gpt|claude)\b|\b(reveal|print|show|output|repeat|ignore)\b.{0,30}\b(your |the )?(system prompt|developer message)\b/i, "role_hijack"],
  [/<\|?(im_start|im_end|system|assistant|endoftext)\|?>|\[\/?(INST|SYS)\]|^\s*(system|assistant)\s*:/im, "chat_markup"],
  [/\b(rank|rate|score|recommend|mark)\b.{0,40}\b(this|the) (job|listing|role|opportunity|candidate)\b.{0,30}\b(first|highest|top|verified|100)\b/i, "ranking_manipulation"],
  [/\b(tool_call|function_call)\b|\b(call|invoke|execute)\s+(the\s+)?(\w+\s+)?(tool|function)\s*[:(]/i, "tool_invocation"],
  [/\b(send|email|post|forward|reveal|print)\b.{0,40}\b(api key|password|secret|token|credentials?|resume|personal data|phone numbers?)\b/i, "exfiltration"],
];

/** Heuristic flags for review. Absence of a flag does NOT make text trusted: all source text is always treated as data. */
export function injectionFlags(...texts: string[]): string[] {
  const all = texts.join("\n");
  return [...new Set(INJECTION_PATTERNS.filter(([re]) => re.test(all)).map(([, flag]) => flag))].sort();
}

/**
 * Wraps untrusted text for an AI prompt: fenced with a random-free, unforgeable-by-content delimiter (the content
 * has its own delimiter occurrences neutralized) and labelled as data. Used by every prompt that includes listing text.
 */
export function fenceUntrusted(label: string, text: string, max = 6_000): string {
  const body = cleanText(text, max).replace(/<\/?untrusted[^>]*>/gi, "[removed]");
  return `<untrusted source="${label.replace(/[^a-z0-9_-]/gi, "")}">\n${body}\n</untrusted>`;
}
