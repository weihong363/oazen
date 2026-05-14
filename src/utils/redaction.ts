const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, replacement: "[redacted-private-key]" },
  { pattern: /\bbearer\s+[a-z0-9._-]{16,}\b/gi, replacement: "bearer [redacted-token]" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/gi, replacement: "[redacted-secret]" },
  { pattern: /\b(?:ghp|gho|ghu|sk|xoxb|xoxp)-[a-z0-9-]{10,}\b/gi, replacement: "[redacted-token]" },
];

export function redactSecrets(text: string): string {
  return REDACTION_RULES.reduce((current, rule) => current.replace(rule.pattern, rule.replacement), text);
}
