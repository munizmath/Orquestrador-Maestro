"use strict";

const crypto = require("node:crypto");

const CLASSIFICATIONS = Object.freeze({
  PUBLIC_SAFE: "public-safe",
  LOCAL_ONLY: "local-only",
  PII: "pii",
  SECRET: "secret",
  AUDIT_SAFE: "audit-safe",
  UNKNOWN: "unknown",
});

const SECRET_KEY_RE = /\b(?:api[_-]?key|token|secret|password|passwd|pwd|bearer)\b/i;
const SECRET_VALUE_RE = /\b(?:sk|pk|ghp|gho|ghu|ghs|xoxb|xoxp|AKIA)[A-Za-z0-9_\-]{12,}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){10,16}\d/g;
const LOCAL_PATH_RE = /(?:[A-Za-z]:\\|\\\\wsl\.localhost\\|\/home\/|\/mnt\/[a-z]\/|\/Users\/)[^\s"'<>]+/g;
const URL_SECRET_RE = /(https?:\/\/[^\s"'<>?]+)\?([^\s"'<>]*(?:token|key|secret|password)[^\s"'<>]*)/gi;

function hashText(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function classifyText(value) {
  const text = String(value || "");
  if (!text) return CLASSIFICATIONS.PUBLIC_SAFE;
  if (SECRET_KEY_RE.test(text) || SECRET_VALUE_RE.test(text)) return CLASSIFICATIONS.SECRET;
  if (EMAIL_RE.test(text) || PHONE_RE.test(text)) return CLASSIFICATIONS.PII;
  if (LOCAL_PATH_RE.test(text)) return CLASSIFICATIONS.LOCAL_ONLY;
  return CLASSIFICATIONS.PUBLIC_SAFE;
}

function mergeClassification(left, right) {
  const order = [
    CLASSIFICATIONS.PUBLIC_SAFE,
    CLASSIFICATIONS.AUDIT_SAFE,
    CLASSIFICATIONS.LOCAL_ONLY,
    CLASSIFICATIONS.PII,
    CLASSIFICATIONS.SECRET,
    CLASSIFICATIONS.UNKNOWN,
  ];
  return order.indexOf(left) > order.indexOf(right) ? left : right;
}

function redactText(value) {
  return String(value)
    .replace(URL_SECRET_RE, "$1?[REDACTED_QUERY]")
    .replace(SECRET_VALUE_RE, "[REDACTED_SECRET]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(PHONE_RE, "[REDACTED_PHONE]")
    .replace(LOCAL_PATH_RE, "[REDACTED_PATH]");
}

function redactValue(value, options = {}) {
  const maxStringLength = options.maxStringLength || 400;

  if (value === null || value === undefined) {
    return { value, classification: CLASSIFICATIONS.PUBLIC_SAFE, redacted: false };
  }

  if (typeof value === "string") {
    const classification = classifyText(value);
    let nextValue = redactText(value);
    let redacted = nextValue !== value;
    if (nextValue.length > maxStringLength) {
      nextValue = `${nextValue.slice(0, maxStringLength)}...[TRUNCATED:${hashText(nextValue)}]`;
      redacted = true;
    }
    return { value: nextValue, classification, redacted };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return { value, classification: CLASSIFICATIONS.PUBLIC_SAFE, redacted: false };
  }

  if (Array.isArray(value)) {
    let classification = CLASSIFICATIONS.PUBLIC_SAFE;
    let redacted = false;
    const list = value.map((item) => {
      const result = redactValue(item, options);
      classification = mergeClassification(classification, result.classification);
      redacted = redacted || result.redacted;
      return result.value;
    });
    return { value: list, classification, redacted };
  }

  if (typeof value === "object") {
    let classification = CLASSIFICATIONS.PUBLIC_SAFE;
    let redacted = false;
    const object = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) {
        object[key] = "[REDACTED_SECRET]";
        classification = mergeClassification(classification, CLASSIFICATIONS.SECRET);
        redacted = true;
        continue;
      }
      const result = redactValue(item, options);
      classification = mergeClassification(classification, result.classification);
      redacted = redacted || result.redacted;
      object[key] = result.value;
    }
    return { value: object, classification, redacted };
  }

  return {
    value: String(value),
    classification: classifyText(String(value)),
    redacted: true,
  };
}

function assertAuditSafe(value) {
  const result = redactValue(value);
  const serialized = JSON.stringify(result.value);
  const classification = classifyText(serialized);
  if (classification === CLASSIFICATIONS.SECRET || classification === CLASSIFICATIONS.PII) {
    throw new Error("Valor ainda contem dado sensivel apos redaction.");
  }
  return result;
}

module.exports = {
  CLASSIFICATIONS,
  classifyText,
  hashText,
  mergeClassification,
  redactText,
  redactValue,
  assertAuditSafe,
};
