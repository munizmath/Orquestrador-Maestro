"use strict";

const { hashText } = require("../core/security.js");
const { dryRunConnector } = require("./connector-service.js");

function recipientRef(value) {
  return `recipient_${hashText(String(value || "unknown"))}`;
}

function previewMessage(input = {}) {
  const consent = Boolean(input.consent);
  const recipient = recipientRef(input.recipient || "placeholder");
  const body = String(input.body || "").slice(0, 500);
  const result = dryRunConnector("mock-message-channel", {
    action: "message.send",
    payload: {
      recipientRef: recipient,
      body,
      templateId: input.templateId || "mock-template",
      locale: input.locale || "pt-BR",
    },
  }, {
    confirmed: true,
    consent,
  });
  return {
    ok: result.ok,
    recipientRef: recipient,
    consent,
    preview: result,
  };
}

module.exports = {
  previewMessage,
  recipientRef,
};
