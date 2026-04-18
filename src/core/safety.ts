import { MemorySafety } from "./types";

type RedactionRule = {
  pattern: RegExp;
  replacement: string;
};

const BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i, reason: "private key block" },
  { pattern: /\bbearer\s+[a-z0-9._-]{16,}\b/i, reason: "bearer token" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/i, reason: "credential assignment" },
  { pattern: /\b(?:ghp|gho|ghu|sk|xoxb|xoxp)-[a-z0-9-]{10,}\b/i, reason: "token-like secret" },
];

const REVIEW_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\/Users\/[^\s]+/i, reason: "private filesystem path" },
  { pattern: /(?:[A-Z]:\\Users\\|\/home\/[^\s]+)/i, reason: "private filesystem path" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, reason: "email address" },
  { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, reason: "phone number" },
  { pattern: /\b(?:ssn|social security|home address|private address)\b/i, reason: "personal privacy content" },
];

const REDACTION_RULES: RedactionRule[] = [
  { pattern: /\/Users\/[^\s]+/gi, replacement: "[redacted-path]" },
  { pattern: /(?:[A-Z]:\\Users\\[^\s]+|\/home\/[^\s]+)/gi, replacement: "[redacted-path]" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[redacted-email]" },
  { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[redacted-phone]" },
  { pattern: /\bbearer\s+[a-z0-9._-]{16,}\b/gi, replacement: "bearer [redacted-token]" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/gi, replacement: "[redacted-secret]" },
];

function applyRedactions(text: string): string {
  return REDACTION_RULES.reduce(
    (current, rule) => current.replace(rule.pattern, rule.replacement),
    text
  );
}

export function screenMemoryText(text: string): MemorySafety {
  const blockedReasons = BLOCK_PATTERNS
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.reason);

  if (blockedReasons.length > 0) {
    const redactedContent = applyRedactions(text);
    return {
      level: "blocked",
      reasons: blockedReasons,
      redactedTitle: redactedContent.slice(0, 80),
      redactedContent,
      restrictedToInbox: true,
    };
  }

  const reviewReasons = REVIEW_PATTERNS
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.reason);
  const redactedContent = applyRedactions(text);

  return {
    level: reviewReasons.length > 0 ? "review" : "safe",
    reasons: reviewReasons,
    redactedTitle: redactedContent.slice(0, 80),
    redactedContent,
    restrictedToInbox: reviewReasons.length > 0,
  };
}
