"use strict";

const http = require("node:http");
const https = require("node:https");
const { redactValue } = require("../core/security.js");

function normalizeHeaders(headers = {}) {
  return redactValue(headers).value;
}

function assertAllowedHost(url, allowedHosts = []) {
  if (allowedHosts.length === 0) return;
  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`Host not allowed for egress: ${url.hostname}`);
  }
}

function requestJson(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 5000);
  if (!options.url) throw new Error("HTTP request requires url.");
  const url = new URL(options.url);
  assertAllowedHost(url, options.allowedHosts || []);
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  const transport = url.protocol === "http:" ? http : https;
  const headers = {
    "content-type": "application/json",
    "user-agent": "orquestrador-maestro-local",
    ...(options.headers || {}),
  };
  if (body) headers["content-length"] = Buffer.byteLength(body);

  return new Promise((resolve) => {
    const request = transport.request({
      method: options.method || "GET",
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      headers,
      timeout: timeoutMs,
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          redactedRequest: redactValue({ url: url.toString(), headers: normalizeHeaders(headers), body: options.body || null }).value,
          redactedResponse: redactValue(data.slice(0, 1000)).value,
        });
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, code: "timeout", redactedRequest: redactValue({ url: url.toString(), headers: normalizeHeaders(headers) }).value });
    });
    request.on("error", (error) => {
      resolve({ ok: false, code: error.code || "request_error", redactedRequest: redactValue({ url: url.toString(), headers: normalizeHeaders(headers) }).value });
    });
    if (body) request.write(body);
    request.end();
  });
}

module.exports = {
  assertAllowedHost,
  requestJson,
};
