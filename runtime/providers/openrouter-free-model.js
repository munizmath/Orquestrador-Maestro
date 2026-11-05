"use strict";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";

function zeroPrice(value) {
  if (typeof value === "number") return Number.isFinite(value) && value === 0;
  return typeof value === "string" && /^0+(?:\.0+)?$/u.test(value);
}

function zeroPricing(pricing) {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return false;
  if (!zeroPrice(pricing.prompt) || !zeroPrice(pricing.completion)) return false;
  return Object.entries(pricing).every(([key, value]) => {
    if (key === "overrides") {
      return Array.isArray(value) && value.every((override) => {
        if (!override || typeof override !== "object" || Array.isArray(override)) return false;
        return Object.entries(override).every(([overrideKey, overrideValue]) =>
          overrideKey === "min_prompt_tokens" && Number.isSafeInteger(overrideValue) && overrideValue >= 0 || zeroPrice(overrideValue));
      });
    }
    return zeroPrice(value);
  });
}

async function assertOpenRouterFreeModel(model, { fetchCatalog = globalThis.fetch } = {}) {
  const slug = typeof model === "string" && model.startsWith("openrouter/") ? model.slice("openrouter/".length) : "";
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*:free$/u.test(slug)) {
    throw new Error("OPENROUTER_FREE_MODEL_REQUIRED: selecione um ID explícito openrouter/<autor>/<modelo>:free.");
  }

  let response;
  try {
    response = await fetchCatalog(CATALOG_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Error("OPENROUTER_CATALOG_UNAVAILABLE: não foi possível confirmar o preço do modelo.");
  }
  if (!response?.ok) throw new Error("OPENROUTER_CATALOG_UNAVAILABLE: catálogo indisponível.");

  let catalog;
  try {
    catalog = await response.json();
  } catch {
    throw new Error("OPENROUTER_CATALOG_UNAVAILABLE: resposta inválida do catálogo.");
  }
  const entry = Array.isArray(catalog?.data) ? catalog.data.find((candidate) => candidate?.id === slug) : undefined;
  if (!entry || !zeroPricing(entry.pricing)) {
    throw new Error("OPENROUTER_COST_UNVERIFIED: modelo ausente, preço desconhecido ou preço diferente de zero.");
  }
  if (!Array.isArray(entry.supported_parameters) || !entry.supported_parameters.includes("tools")) {
    throw new Error("OPENROUTER_TOOLS_UNVERIFIED: o modelo não comprova suporte a ferramentas.");
  }
  return { model, cost: { status: "LIVE", amount: 0 }, quota: { status: "UNKNOWN" } };
}

module.exports = { assertOpenRouterFreeModel };
