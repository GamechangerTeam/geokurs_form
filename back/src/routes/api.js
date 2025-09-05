// ===============================
// backend/src/routes.js
// ===============================
import express from "express";
import CONFIG from "../config/config.js";
import {
  findItemsBySerial as findItemsBySerial,
  searchProductsByName,
  moveItemToStage,
  getProductsFromSections,
  getDealProductRows,
  setDealProductRows,
  setItemProductRows,
} from "../b24/client.js";
import { handleDiagnostics } from "../services/diagnostics.js";

import "../global.js"; // выставляет globalThis.LOG_TYPES
import { logMessage } from "../utils/logger.js";

const router = express.Router();

// health
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "b24-mini-backend" });
});

// ===== Приборы по серийному (только категория 11 через клиент) =====
router.get("/api/device/by-serial/:serial", async (req, res) => {
  const { serial } = req.params;
  try {
    const items = await findItemsBySerial(serial);
    if (!items || items.length === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const result = items.map((item) => {
      const top = item || {};
      const uf = item.ufCrm || item.fields || {};

      const serialVal =
        item.serial ??
        top[CONFIG.FIELDS.SERIAL] ??
        uf[CONFIG.FIELDS.SERIAL] ??
        null;

      const name =
        item.name ??
        (CONFIG.FIELDS.NAME
          ? top[CONFIG.FIELDS.NAME] ?? uf[CONFIG.FIELDS.NAME]
          : undefined) ??
        item.title ??
        "(без названия)";

      const dealId =
        item.dealId ??
        top[CONFIG.FIELDS.DEAL_ID] ??
        uf[CONFIG.FIELDS.DEAL_ID] ??
        null;

      return {
        id: item.id,
        name,
        serial: serialVal,
        stageId: item.stageId,
        dealId,
      };
    });

    logMessage(
      globalThis.LOG_TYPES?.A || "access",
      "GET /api/device/by-serial",
      serial
    );

    res.json(result);
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "GET /api/device/by-serial",
      e
    );
    res.status(500).json({ error: "INTERNAL", details: e.message });
  }
});

// ===== Поиск товаров по имени (классический каталог) =====
router.get("/api/products/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  try {
    const list = await searchProductsByName(q);
    res.json(
      list.map((p) => ({
        id: String(p.ID),
        name: p.NAME,
        price: Number(p.PRICE || 0),
        currency: p.CURRENCY_ID || "RUB",
        sectionId: Number(p.SECTION_ID || 0),
      }))
    );
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "GET /api/products/search",
      e
    );
    res.status(500).json({ error: "INTERNAL", details: e.message });
  }
});

// ===== Перезаписать товарные позиции элемента SPA (прибор) =====
router.post("/api/item/:itemId/productrows/set", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ ok: false, error: "BAD_ITEM_ID" });
    }

    const body = req.body || {};
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];
    const rows = rowsIn
      .map((r) => ({
        productId: Number(r.productId ?? r.id ?? r.PRODUCT_ID),
        price: Number(r.price ?? r.PRICE ?? 0),
        quantity: Number(r.quantity ?? r.qty ?? r.QUANTITY ?? 1),
      }))
      .filter(
        (r) => Number.isFinite(r.productId) && Number.isFinite(r.quantity)
      );

    await setItemProductRows(itemId, rows);

    logMessage(
      globalThis.LOG_TYPES?.I || "info",
      "POST /api/item/:itemId/productrows/set",
      JSON.stringify({ itemId, count: rows.length })
    );

    res.json({ ok: true, itemId, count: rows.length });
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "POST /api/item/:itemId/productrows/set",
      e
    );
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ===== Все товары из секций (по умолчанию 653 и 654; можно передать ids=) =====
router.get("/api/products/sections", async (req, res) => {
  try {
    const idsParam = String(req.query.ids || "").trim();
    const sectionIds = idsParam
      ? idsParam
          .split(",")
          .map((x) => parseInt(x, 10))
          .filter((n) => Number.isFinite(n))
      : [653, 654];

    const list = await getProductsFromSections(sectionIds);

    const mapped = (list || []).map((p) => ({
      id: String(p.ID ?? p.id),
      name: p.NAME ?? p.name ?? "(без названия)",
      price: Number(p.PRICE ?? p.price ?? 0),
      currency: p.CURRENCY_ID ?? p.currency ?? "RUB",
      sectionId: Number(p.SECTION_ID ?? p.sectionId ?? 0),
    }));

    logMessage(
      globalThis.LOG_TYPES?.A || "access",
      "GET /api/products/sections",
      JSON.stringify({ sectionIds, count: mapped.length })
    );

    res.json(mapped);
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "GET /api/products/sections",
      e
    );
    res.status(500).json({ error: "INTERNAL", details: e.message });
  }
});

// ===== Товары одной секции =====
router.get("/api/products/sections/:sectionId", async (req, res) => {
  try {
    const sectionId = parseInt(req.params.sectionId, 10);
    if (!Number.isFinite(sectionId)) {
      return res.status(400).json({ error: "BAD_SECTION_ID" });
    }

    const list = await getProductsFromSections([sectionId]);

    const mapped = (list || []).map((p) => ({
      id: String(p.ID ?? p.id),
      name: p.NAME ?? p.name ?? "(без названия)",
      price: Number(p.PRICE ?? p.price ?? 0),
      currency: p.CURRENCY_ID ?? p.currency ?? "RUB",
      sectionId: Number(p.SECTION_ID ?? p.sectionId ?? sectionId),
    }));

    logMessage(
      globalThis.LOG_TYPES?.A || "access",
      "GET /api/products/sections/:sectionId",
      JSON.stringify({ sectionId, count: mapped.length })
    );

    res.json(mapped);
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "GET /api/products/sections/:sectionId",
      e
    );
    res.status(500).json({ error: "INTERNAL", details: e.message });
  }
});

// ===== diagnostics submit =====
router.post("/api/diagnostics", async (req, res) => {
  try {
    const result = await handleDiagnostics(req.body || {});
    logMessage(
      globalThis.LOG_TYPES?.I || "info",
      "POST /api/diagnostics",
      JSON.stringify(result)
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    logMessage(globalThis.LOG_TYPES?.E || "error", "POST /api/diagnostics", e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ===== shipping (move to SENT) =====
router.post("/api/ship", async (req, res) => {
  try {
    const { itemId, serial, stageId } = req.body || {};
    if (!stageId) return res.status(400).json({ ok: false, error: "NO_STAGE" });

    let id = itemId;
    if (!id && serial) {
      const items = await findItemsBySerial(serial);
      if (!items?.length)
        return res.status(404).json({ ok: false, error: "ITEM_NOT_FOUND" });
      id = items[0].id;
    }
    if (!id) return res.status(400).json({ ok: false, error: "NO_ITEM" });

    await moveItemToStage(id, stageId);
    return res.json({ ok: true, itemId: id, stageId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== Добавить товар/услугу в товарные позиции сделки =====
router.post("/api/deal/:dealId/productrows/add", async (req, res) => {
  try {
    const dealId = parseInt(req.params.dealId, 10);
    if (!Number.isFinite(dealId)) {
      return res.status(400).json({ ok: false, error: "BAD_DEAL_ID" });
    }

    const b = req.body || {};
    const productId = Number(b.productId ?? b.id ?? b.PRODUCT_ID);
    const price = Number(b.price ?? b.PRICE ?? 0);
    const quantity = Number(b.quantity ?? b.qty ?? b.QUANTITY ?? 1);

    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ ok: false, error: "BAD_PRODUCT_ID" });
    }
    const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

    const existing = await getDealProductRows(dealId);
    const rows = Array.isArray(existing) ? existing.slice() : [];
    rows.push({ PRODUCT_ID: productId, PRICE: price, QUANTITY: q });

    await setDealProductRows(dealId, rows);

    logMessage(
      globalThis.LOG_TYPES?.I || "info",
      "POST /api/deal/:dealId/productrows/add",
      JSON.stringify({ dealId, productId, price, quantity: q })
    );

    res.json({ ok: true, dealId, added: { productId, price, quantity: q } });
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "POST /api/deal/:dealId/productrows/add",
      e
    );
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ===== Перезаписать товарные позиции сделки (set) =====
router.post("/api/deal/:dealId/productrows/set", async (req, res) => {
  try {
    const dealId = parseInt(req.params.dealId, 10);
    if (!Number.isFinite(dealId)) {
      return res.status(400).json({ ok: false, error: "BAD_DEAL_ID" });
    }

    const body = req.body || {};
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];
    const rows = rowsIn
      .map((r) => ({
        PRODUCT_ID: Number(r.productId ?? r.id ?? r.PRODUCT_ID),
        PRICE: Number(r.price ?? r.PRICE ?? 0),
        QUANTITY: Number(r.quantity ?? r.qty ?? r.QUANTITY ?? 1),
      }))
      .filter(
        (r) => Number.isFinite(r.PRODUCT_ID) && Number.isFinite(r.QUANTITY)
      );

    await setDealProductRows(dealId, rows);

    logMessage(
      globalThis.LOG_TYPES?.I || "info",
      "POST /api/deal/:dealId/productrows/set",
      JSON.stringify({ dealId, count: rows.length })
    );

    res.json({ ok: true, dealId, count: rows.length });
  } catch (e) {
    logMessage(
      globalThis.LOG_TYPES?.E || "error",
      "POST /api/deal/:dealId/productrows/set",
      e
    );
    res.status(400).json({ ok: false, error: e.message });
  }
});

export default router;
