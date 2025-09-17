// ===============================
// backend/src/b24/client.js
// ===============================
import CONFIG from "../config/config.js";
import { getWebhookUrl } from "../utils/secret.js";

/* =========================== базовый вызов =========================== */
async function callB24(method, params = {}) {
  const base = await getWebhookUrl();
  const url = `${base}${method}.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if ("result" in data) return data.result;
  const err = data?.error_description || data?.error || "Bitrix24 call failed";
  throw new Error(`${method}: ${err}`);
}

/* =========================== batch helpers =========================== */
function toBatchCmd(method, params = {}) {
  const parts = [];
  const { filter, order, select, start, ...rest } = params;

  if (filter && typeof filter === "object") {
    for (const [k, v] of Object.entries(filter)) {
      if (v === undefined || v === null || v === "") continue;
      parts.push(
        `${encodeURIComponent(`filter[${k}]`)}=${encodeURIComponent(String(v))}`
      );
    }
  }

  if (order && typeof order === "object") {
    for (const [k, v] of Object.entries(order)) {
      parts.push(
        `${encodeURIComponent(`order[${k}]`)}=${encodeURIComponent(String(v))}`
      );
    }
  }

  if (Array.isArray(select)) {
    for (const s of select) {
      parts.push(`${encodeURIComponent("select[]")}=${encodeURIComponent(s)}`);
    }
  }

  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }

  if (start !== undefined) {
    parts.push(`start=${encodeURIComponent(String(start))}`);
  }

  return `${method}?${parts.join("&")}`;
}

async function callBatch(cmdMap, halt = 0) {
  return callB24("batch", { halt, cmd: cmdMap });
}

/* =========================== helpers =========================== */
function pickField(obj, code) {
  if (!obj || !code) return undefined;
  return (
    obj[code] ??
    (obj.ufCrm ? obj.ufCrm[code] : undefined) ??
    (obj.fields ? obj.fields[code] : undefined)
  );
}

/* =========================== SPA items (ПРИБОРЫ) =========================== */
export async function findItemsBySerial(serial) {
  if (!serial?.trim()) return [];

  // ⚠️ Ограничиваемся только категорией (воронкой) 11
  const filter = {
    [CONFIG.FIELDS.SERIAL]: `%${serial}%`,
    categoryId: 11,
  };

  const select = [
    "id",
    "title",
    "stageId",
    "ufCrm*",
    "updatedTime",
    CONFIG.FIELDS.SERIAL || undefined,
    CONFIG.FIELDS.NAME || undefined,
    CONFIG.FIELDS.DEAL_ID || undefined,
  ].filter(Boolean);

  const result = await callB24("crm.item.list", {
    entityTypeId: CONFIG.SPA_ENTITY_TYPE_ID,
    filter,
    order: { id: "desc" },
    select,
  });

  const items = result?.items || [];
  return items.map((it) => {
    const serialVal = pickField(it, CONFIG.FIELDS.SERIAL) ?? null;
    const nameVal =
      pickField(it, CONFIG.FIELDS.NAME) ?? it.title ?? "(без названия)";
    const dealIdVal = pickField(it, CONFIG.FIELDS.DEAL_ID) ?? null;

    return {
      ...it,
      serial: serialVal,
      name: nameVal,
      dealId: dealIdVal,
    };
  });
}

export async function updateItemFields(itemId, fields) {
  return callB24("crm.item.update", {
    entityTypeId: CONFIG.SPA_ENTITY_TYPE_ID,
    id: itemId,
    fields,
  });
}

// ✅ Товары в элементе смарт‑процесса (SPA): используем crm.item.productrow.set
// ⚠️ У вас SYMBOL_CODE_SHORT = 'Tb1' — захардкожено по согласованию
export async function setItemProductRows(itemId, rows) {
  const productRows = (rows || [])
    .map((r) => ({
      productId: Number(r.productId ?? r.PRODUCT_ID ?? r.id),
      price: Number(r.price ?? r.PRICE ?? 0),
      quantity: Number(r.quantity ?? r.QUANTITY ?? r.qty ?? 1),
    }))
    .filter((r) => Number.isFinite(r.productId) && r.quantity > 0);

  return callB24("crm.item.productrow.set", {
    ownerType: "Tb1", // <- ЖЁСТКО: тип вашего SPA
    ownerId: Number(itemId), // ID элемента SPA
    productRows, // Полный список строк (перезапись)
  });
}

/* =========================== сделки =========================== */
export async function addDeal(fields) {
  return callB24("crm.deal.add", { fields });
}

export async function getDealProductRows(dealId) {
  try {
    const rows = await callB24("crm.deal.productrows.get", { id: dealId });
    return rows || [];
  } catch {
    return [];
  }
}

export async function setDealProductRows(dealId, rows) {
  return callB24("crm.deal.productrows.set", { id: dealId, rows });
}

/* =========================== каталог CRM (классический) =========================== */
export async function searchProductsByName(query) {
  const res = await callB24("crm.product.list", {
    order: { NAME: "asc" },
    filter: { "%NAME": query, ACTIVE: "Y" },
    select: ["ID", "NAME", "PRICE", "CURRENCY_ID", "SECTION_ID"],
  });
  return res || [];
}

export async function getProductPrice(productId) {
  try {
    const p = await callB24("crm.product.get", { id: productId });
    return { price: Number(p?.PRICE || 0), currency: p?.CURRENCY_ID || "RUB" };
  } catch {
    return { price: 0, currency: "RUB" };
  }
}

/* =========================== батч: товары по секциям =========================== */
export async function getProductsFromSections(sectionIds = [653, 654]) {
  const select = ["ID", "NAME", "PRICE", "CURRENCY_ID", "SECTION_ID"];
  const order = { ID: "asc" };

  const cursors = Object.fromEntries(sectionIds.map((sid) => [sid, 0]));
  const done = new Set();
  const seen = new Set();
  const out = [];

  while (done.size < sectionIds.length) {
    const cmd = {};
    for (const sid of sectionIds) {
      if (done.has(sid)) continue;
      cmd[`sec${sid}_s${cursors[sid]}`] = toBatchCmd("crm.product.list", {
        order,
        filter: { SECTION_ID: sid, ACTIVE: "Y" },
        select,
        start: cursors[sid],
      });
    }

    if (Object.keys(cmd).length === 0) break;

    const batchRes = await callBatch(cmd, 0);
    const resultMap = batchRes?.result || {};
    const nextMap = batchRes?.result_next || {};

    for (const arr of Object.values(resultMap)) {
      const list = Array.isArray(arr) ? arr : [];
      for (const p of list) {
        const id = p?.ID ?? p?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(p);
      }
    }

    for (const sid of sectionIds) {
      const keyPrefix = `sec${sid}_s`;
      const matchedKey = Object.keys(resultMap).find((k) =>
        k.startsWith(keyPrefix)
      );
      if (!matchedKey) continue;

      const next = nextMap?.[matchedKey];
      if (next === undefined || next === null || next === false) {
        done.add(sid);
      } else {
        cursors[sid] = next;
      }
    }
  }

  return out;
}

export async function moveItemToStage(itemId, stageId) {
  return updateItemFields(itemId, { stageId });
}

/* ===================== Currency helpers (add-ons) ===================== */
// СП валют: entityTypeId=1124, categoryId=0; поле с курсом (1 единица = N тенге)
const CURRENCY_ENTITY_TYPE_ID = 1124;
const CURRENCY_CATEGORY_ID = 0;
const RATE_FIELD_CODE = "ufCrm27_1757683948545";

/** Валюты из смарт-процесса 1124 (категория 0) */
export async function listCurrencies1124() {
  try {
    const res = await callB24("crm.item.list", {
      entityTypeId: CURRENCY_ENTITY_TYPE_ID,
      select: ["id", "title", RATE_FIELD_CODE],
      order: { title: "asc" },
    });
    const items = Array.isArray(res?.items) ? res.items : [];
    const mapped = items
      .map((x) => {
        const title = (x.title || "").trim();
        const code = (title || String(x.id)).toUpperCase();
        const rate = Number(x[RATE_FIELD_CODE]);
        if (!rate) return null;
        return { code, name: title || code, rateKZT: rate };
      })
      .filter(Boolean);
    const kzt = { code: "KZT", name: "KZT (тенге)", rateKZT: 1 };
    return [kzt, ...mapped.filter((c) => c.code !== "KZT")];
  } catch {
    return [{ code: "KZT", name: "KZT (тенге)", rateKZT: 1 }];
  }
}

/** Валюты, включённые на портале (CRM → Настройки → Валюты) */
export async function portalCurrencies() {
  try {
    const res = await callB24("crm.currency.list", {});
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

/** Установить валюту сделки (CURRENCY_ID) */
export async function setDealCurrency(dealId, currencyCode) {
  return callB24("crm.deal.update", {
    id: dealId,
    fields: { CURRENCY_ID: currencyCode },
  });
}

/**
 * Обеспечить валюту сделки и положить productrows
 * rows: массив «сырых» строк [{ PRODUCT_ID?|PRODUCT_NAME?, PRICE, QUANTITY, ... }]
 * Если валюта поддерживается порталом → ставим её на сделку и на строки (без конвертации)
 * Иначе → конвертируем в KZT по rateKZT, ставим KZT.
 */
export async function ensureDealCurrencyAndSetRowsRaw(
  dealId,
  rowsRaw,
  { currency = "KZT", rateKZT = 1, useProductName = false } = {}
) {
  const list = await portalCurrencies();
  const supported = new Set(
    (Array.isArray(list) ? list : []).map((c) =>
      String(c.CURRENCY || "").toUpperCase()
    )
  );

  const raw = String(currency || "KZT");
  let code = raw.toUpperCase();
  if (!supported.has(code)) {
    const n = raw.trim().toLowerCase();
    if (n.includes("сом") || n.includes("som")) code = "KGS";
    else if (n.includes("руб")) code = "RUB";
    else if (n.includes("дол") || n.includes("usd") || n.includes("$"))
      code = "USD";
    else if (n.includes("евр") || n.includes("eur")) code = "EUR";
    else if (n.includes("тенг") || n.includes("kzt")) code = "KZT";
  }

  const norm = (r) => {
    const priceRaw = r.PRICE ?? r.price ?? 0;
    const qtyRaw = r.QUANTITY ?? r.qty ?? 1;
    const base = {
      PRICE: Number(priceRaw) || 0,
      QUANTITY: Number(qtyRaw) || 1,
    };
    if (useProductName) {
      return {
        ...base,
        PRODUCT_NAME: r.PRODUCT_NAME ?? r.name ?? String(r.id),
      };
    }
    return { ...base, PRODUCT_ID: r.PRODUCT_ID ?? r.id };
  };

  if (supported.has(code)) {
    await setDealCurrency(dealId, code);
    const rows = (rowsRaw || []).map((r) => ({
      ...norm(r),
      CURRENCY_ID: code,
    }));
    return setDealProductRows(dealId, rows);
  }

  const mul = Number(rateKZT || 1);
  const toKzt = (v) => Math.round((Number(v) || 0) * mul * 100) / 100;
  await setDealCurrency(dealId, "KZT");
  const rowsKzt = (rowsRaw || []).map((r) => ({
    ...norm(r),
    PRICE: toKzt(r.PRICE ?? r.price),
    CURRENCY_ID: "KZT",
  }));
  return setDealProductRows(dealId, rowsKzt);
}
