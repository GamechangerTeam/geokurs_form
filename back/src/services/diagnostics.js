// back/src/services/diagnostics.js

import CONFIG from "../config/config.js";
import {
  findItemsBySerial,
  updateItemFields,
  setItemProductRows, // crm.item.productrow.set (SPA)
  setDealProductRows, // crm.deal.productrows.set (Deal)
  addDeal,
  getDealProductRows, // crm.deal.productrows.get
} from "../b24/client.js";
import { ensureDealCurrencyAndSetRowsRaw } from "../b24/client.js";

/** Маппинг строк для смарт-процесса (SPA) */
function toRowsForSpa(arr = []) {
  return (arr || []).map((r) => ({
    productId: Number(r.id),
    price: Number(r.price || 0),
    quantity: Number(r.qty || 1),
  }));
}

/** Достаём UF-поле из разных форм ответа */
function pickField(obj, code) {
  if (!obj || !code) return undefined;
  return (
    obj[code] ??
    (obj.ufCrm ? obj.ufCrm[code] : undefined) ??
    (obj.fields ? obj.fields[code] : undefined)
  );
}

/** Нормализуем строку сделки, не теряя чужие поля */
function normalizeDealRow(row) {
  const r = { ...row };
  if (r.PRODUCT_ID != null) r.PRODUCT_ID = String(r.PRODUCT_ID);
  if (r.PRODUCT_NAME == null) r.PRODUCT_NAME = "";
  r.PRICE = Number(r.PRICE || 0);
  r.QUANTITY = Number(r.QUANTITY || 1);
  return r;
}

/** Классификаторы: определяем услугу по НАЗВАНИЮ из каталога */
function isDiagnostics(name = "") {
  return /диагност/i.test(String(name));
}
function isVerification(name = "") {
  return /поверк/i.test(String(name));
}
function isRepair(name = "") {
  return /ремонт/i.test(String(name));
}

/** Поиск всех строк сделки по имени (регекс) */
function findRowsByName(rows, regex) {
  const rx = new RegExp(regex, "i");
  return rows
    .map((r, i) => ({ i, r }))
    .filter(({ r }) => rx.test(String(r.PRODUCT_NAME || "")));
}

/** Выбрать PRODUCT_ID для агрегированной позиции (из существующих или из добавляемых услуг) */
function chooseProductIdForAgg(existingRows, fallbackService) {
  const withProd = existingRows.find((r) => r.r.PRODUCT_ID);
  if (withProd) return String(withProd.r.PRODUCT_ID);
  if (fallbackService?.id != null) return String(fallbackService.id);
  return undefined; // допустимо без PRODUCT_ID
}

/** Агрегированная позиция: "слить" существующие + добавляемые (qty/sum), вернуть одну строку */
function buildAggregatedRow({
  existingMatches, // [{i, r}, ...] найденные строки в сделке
  addQty, // добавочное количество
  addSum, // добавочная сумма (unit*qty суммарно)
  rowName, // "Диагностика" или "Поверка"
  fallbackService, // первая услуга данного типа из payload (для PRODUCT_ID)
}) {
  // Текущее состояние в сделке (сумма и qty)
  let curQty = 0;
  let curTotal = 0;
  let productId = chooseProductIdForAgg(existingMatches, fallbackService);

  for (const { r } of existingMatches) {
    curQty += Number(r.QUANTITY || 0);
    curTotal += Number(r.PRICE || 0) * Number(r.QUANTITY || 0);
    if (!productId && r.PRODUCT_ID) productId = String(r.PRODUCT_ID);
  }

  const newQty = curQty + Number(addQty || 0);
  const newTotal = curTotal + Number(addSum || 0);

  if (newQty <= 0) return null;

  const unit = Number((newTotal / newQty).toFixed(2));
  const agg = {
    PRODUCT_NAME: rowName,
    PRICE: unit,
    QUANTITY: newQty,
  };
  if (productId) agg.PRODUCT_ID = String(productId);
  return agg;
}

export async function handleDiagnostics(payload = {}) {
  const {
    serial,
    defects = "",
    verification = false,
    parts = [],
    services = [], // из фронта: [{ id, name, price, qty }]
    currency = "KZT",
    rateKZT = 1,
  } = payload;

  if (!serial || !String(serial).trim()) {
    throw new Error("serial is required");
  }

  // 1) Найти прибор по серийному
  const items = await findItemsBySerial(String(serial).trim());
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("device not found");
  }
  const item = items[0];
  const itemId = item.id;
  const deviceName =
    pickField(item, CONFIG.FIELDS.NAME) ||
    item.name ||
    item.title ||
    `Прибор #${itemId}`;

  // 2) Обеспечить сделку (категория/воронка 11)
  let dealId = item.dealId || pickField(item, CONFIG.FIELDS.DEAL_ID) || null;
  if (!dealId) {
    const title =
      pickField(item, CONFIG.FIELDS.NAME) ||
      item.name ||
      item.title ||
      `Сделка по прибору #${itemId}`;

    dealId = await addDeal({
      TITLE: title,
      CATEGORY_ID: 11, // "негарантийное обслуживание"
      STAGE_ID: "C11:NEW",
    });

    if (CONFIG.FIELDS.DEAL_ID) {
      await updateItemFields(itemId, { [CONFIG.FIELDS.DEAL_ID]: dealId });
    }
  }

  // 3) Запчасти — только в товары ЭЛЕМЕНТА SPA (НЕ в сделку)
  // Стоимость запчастей также будет добавлена к стоимости услуг ремонта ниже
  const spaRows = toRowsForSpa(parts || []);
  if (spaRows.length > 0) {
    await setItemProductRows(itemId, spaRows);
  }

  // 4) Разобрать услуги по типам (по НАЗВАНИЮ из каталога)
  let diagQty = 0,
    diagSum = 0,
    diagFirst = null;
  let verQty = 0,
    verSum = 0,
    verFirst = null;
  const repairs = []; // массив объектов { id, name, unitPrice, qty }

  for (const s of services || []) {
    const qty = Number(s?.qty || 1);
    const unit = Number(s?.price || 0);
    const name = String(s?.name || "");

    if (isDiagnostics(name)) {
      if (!diagFirst) diagFirst = s;
      diagQty += qty;
      diagSum += unit * qty;
    } else if (isVerification(name)) {
      if (!verFirst) verFirst = s;
      verQty += qty;
      verSum += unit * qty;
    } else if (isRepair(name)) {
      repairs.push({ id: s.id, name: s.name, unitPrice: unit, qty });
    } else {
      // если не распознали — считаем это ремонтом (чтобы не терять услугу)
      repairs.push({ id: s.id, name: s.name, unitPrice: unit, qty });
    }
  }

  // 5) Прочитать текущие строки сделки
  let existingRows = [];
  try {
    const raw = await getDealProductRows(dealId);
    existingRows = Array.isArray(raw) ? raw.map(normalizeDealRow) : [];
  } catch {
    existingRows = [];
  }

  // 6) Собрать новый список строк:
  //    — оставляем все, кроме тех, что равны "Диагностика"/"Поверка" (мы их пересоберём)
  const rest = existingRows.filter(
    (r) =>
      !/^\s*диагност/i.test(r.PRODUCT_NAME || "") &&
      !/^\s*поверк/i.test(r.PRODUCT_NAME || "")
  );

  // 6.1 Агрегированная "Диагностика"
  const diagMatches = findRowsByName(existingRows, "^\\s*диагност");
  const diagAgg = buildAggregatedRow({
    existingMatches: diagMatches,
    addQty: diagQty,
    addSum: diagSum,
    rowName: "Диагностика",
    fallbackService: diagFirst,
  });
  if (diagAgg) rest.push(diagAgg);

  // 6.2 Агрегированная "Поверка"
  const verMatches = findRowsByName(existingRows, "^\\s*поверк");
  const verAgg = buildAggregatedRow({
    existingMatches: verMatches,
    addQty: verQty,
    addSum: verSum,
    rowName: "Поверка",
    fallbackService: verFirst,
  });
  if (verAgg) rest.push(verAgg);

  // 6.3 Новые строки по "Ремонт": группируем ремонты по названию (name) и увеличиваем кол-во
  // Создаем группировку ремонтов по ID или имени
  const repairGroups = {};

  // Рассчитываем общую стоимость запчастей
  const totalPartsPrice = (parts || []).reduce(
    (sum, p) => sum + Number(p.price || 0) * Number(p.qty || 1),
    0
  );

  // Рассчитываем стоимость запчастей на единицу ремонта
  const totalRepairsQty = repairs.reduce(
    (sum, r) => sum + Number(r.qty || 0),
    0
  );

  // Добавочная стоимость запчастей к каждому ремонту
  const partsPricePerRepair =
    totalRepairsQty > 0 ? totalPartsPrice / totalRepairsQty : 0;

  for (const r of repairs) {
    // Добавляем стоимость запчастей к стоимости ремонта
    const unit = Number(r.unitPrice || 0) + partsPricePerRepair;
    const pid = r.id != null ? String(r.id) : undefined;
    const qty = Number(r.qty || 0);
    const name = String(r.name || "Ремонт");
    const fullName = `${name} — ${deviceName}`;

    // Используем ID+имя как ключ для группировки
    const groupKey = pid ? `${pid}_${fullName}` : fullName;

    if (!repairGroups[groupKey]) {
      repairGroups[groupKey] = {
        PRODUCT_NAME: fullName,
        PRICE: unit,
        QUANTITY: qty,
      };
      if (pid) repairGroups[groupKey].PRODUCT_ID = pid;
    } else {
      // Если такой ремонт уже есть, увеличиваем количество
      repairGroups[groupKey].QUANTITY += qty;
    }
  } // Добавляем сгруппированные ремонты в общий список
  for (const key in repairGroups) {
    rest.push(repairGroups[key]);
  }

  // 7) Записать общий список обратно в сделку
  await ensureDealCurrencyAndSetRowsRaw(dealId, rest, {
    currency,
    rateKZT,
    // поставь true, если строки создаются по названию, а не по каталогу:
    useProductName: true, // или false, если используешь PRODUCT_ID
  });

  // 8) Поля прибора: дефекты, поверка, сумма (услуги + запчасти)
  // Стоимость запчастей уже включена в стоимость ремонта, поэтому отдельно не учитываем
  const sumParts = (parts || []).reduce(
    (s, p) => s + Number(p.price || 0) * Number(p.qty || 1),
    0
  );
  const sumServices =
    diagSum +
    verSum +
    repairs.reduce(
      (acc, r) => acc + Number(r.unitPrice || 0) * Number(r.qty || 0),
      0
    );
  // Сумма услуг уже включает стоимость запчастей через partsPricePerRepair
  const sumTotal = Number(sumServices.toFixed(2));

  const fieldsToUpdate = {};
  if (CONFIG.FIELDS.DEFECTS) {
    fieldsToUpdate[CONFIG.FIELDS.DEFECTS] = defects || "";
  }
  if (CONFIG.FIELDS.VERIFICATION) {
    fieldsToUpdate[CONFIG.FIELDS.VERIFICATION] = verification ? "Y" : "N";
  }
  if (CONFIG.FIELDS.SUM_SERVICES) {
    fieldsToUpdate[CONFIG.FIELDS.SUM_SERVICES] = sumTotal;
  }
  if (Object.keys(fieldsToUpdate).length > 0) {
    await updateItemFields(itemId, fieldsToUpdate);
  }

  return {
    itemId,
    dealId,
    diagQty,
    verQty,
    repairsAdded: repairs.reduce((n, r) => n + Number(r.qty || 0), 0),
    sumParts,
    sumServices,
    sumTotal,
  };
}
