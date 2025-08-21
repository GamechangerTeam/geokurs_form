import CONFIG from "../config/config.js";
import {
  findItemsBySerial,
  updateItemFields,
  setItemProductRows, // crm.item.productrow.set (SPA)
  setDealProductRows, // crm.deal.productrows.set (Deal)
  addDeal,
} from "../b24/client.js";

// Маппинг строк для сделки (ожидает UPPER_CASE)
function toRowsForDeal(arr = []) {
  return (arr || []).map((r) => ({
    PRODUCT_ID: String(r.id),
    PRICE: Number(r.price || 0),
    QUANTITY: Number(r.qty || 1),
  }));
}

// Маппинг строк для смарт‑процесса (crm.item.productrow.set ожидает camelCase)
function toRowsForSpa(arr = []) {
  return (arr || []).map((r) => ({
    productId: Number(r.id),
    price: Number(r.price || 0),
    quantity: Number(r.qty || 1),
  }));
}

// Достаём значение UF-поля с учётом возможных вариантов размещения в ответе
function pickField(obj, code) {
  if (!obj || !code) return undefined;
  return (
    obj[code] ??
    (obj.ufCrm ? obj.ufCrm[code] : undefined) ??
    (obj.fields ? obj.fields[code] : undefined)
  );
}

export async function handleDiagnostics(payload = {}) {
  const {
    serial,
    defects = "",
    verification = false,
    parts = [],
    services = [],
  } = payload;

  if (!serial || !String(serial).trim()) {
    throw new Error("serial is required");
  }

  // 1) найти прибор по серийному (берём первый подходящий) — только категория 11 обрезается в клиенте
  const items = await findItemsBySerial(String(serial).trim());
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("device not found");
  }
  const item = items[0];
  const itemId = item.id;

  // 2) обеспечить привязанную сделку (категория/воронка 11)
  let dealId = item.dealId || pickField(item, CONFIG.FIELDS.DEAL_ID) || null;
  if (!dealId) {
    const title =
      pickField(item, CONFIG.FIELDS.NAME) ||
      item.name ||
      item.title ||
      `Сделка по прибору #${itemId}`;
    const newDealId = await addDeal({
      TITLE: title,
      CATEGORY_ID: 11, // воронка "негарантийное обслуживание"
      STAGE_ID: "C11:NEW",
    });
    dealId = newDealId;

    // записать связь сделки в карточку прибора
    if (CONFIG.FIELDS.DEAL_ID) {
      await updateItemFields(itemId, { [CONFIG.FIELDS.DEAL_ID]: dealId });
    }
  }

  // 3) Только запчасти кладём в товары ЭЛЕМЕНТА SPA (услуги идут только в сделку)
  const spaRows = toRowsForSpa(parts || []);
  if (spaRows.length > 0) {
    await setItemProductRows(itemId, spaRows);
  } else {
    // при необходимости можно очищать товары элемента:
    // await setItemProductRows(itemId, []);
  }

  // Услуги кладём только в товары СДЕЛКИ
  const serviceRowsDeal = toRowsForDeal(services);
  if (serviceRowsDeal.length > 0) {
    await setDealProductRows(dealId, serviceRowsDeal);
  }

  // 4) сумма услуг + дефекты/поверка в карточку прибора
  const sumServices = serviceRowsDeal.reduce(
    (s, r) => s + Number(r.PRICE || 0) * Number(r.QUANTITY || 1),
    0
  );

  const fieldsToUpdate = {};
  if (CONFIG.FIELDS.DEFECTS) {
    fieldsToUpdate[CONFIG.FIELDS.DEFECTS] = defects || "";
  }
  if (CONFIG.FIELDS.VERIFICATION) {
    // UF boolean: используем "Y"/"N"
    fieldsToUpdate[CONFIG.FIELDS.VERIFICATION] = verification ? "Y" : "N";
  }
  if (CONFIG.FIELDS.SUM_SERVICES) {
    fieldsToUpdate[CONFIG.FIELDS.SUM_SERVICES] = sumServices;
  }

  if (Object.keys(fieldsToUpdate).length > 0) {
    await updateItemFields(itemId, fieldsToUpdate);
  }

  return {
    itemId,
    dealId,
    partsCount: parts.length,
    servicesCount: services.length,
    spaRowsCount: spaRows.length,
    sumServices,
  };
}
