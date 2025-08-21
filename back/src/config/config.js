import "dotenv/config";

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const CONFIG = {
  PORT: Number(process.env.PORT || 8080),

  // Bitrix24
  B24_WEBHOOK: process.env.BX_LINK || null, // полный URL до /rest/ID/TOKEN/

  // Smart Process (База приборов)
  SPA_ENTITY_TYPE_ID: Number(req("SPA_ENTITY_TYPE_ID")),

  // Поля
  FIELDS: {
    SERIAL: req("FIELD_SERIAL"),
    NAME: process.env.FIELD_NAME || null, // можно оставить null, тогда возьмём item.title
    DEFECTS: req("FIELD_DEFECTS"),
    VERIFICATION: req("FIELD_VERIFICATION"),
    SUM_SERVICES: req("FIELD_SUM_SERVICES"),
    DEAL_ID: req("FIELD_DEAL_ID"),
  },

  // Стадии
  STAGES: {
    SENT: req("STAGE_SENT"),
  },
};

export default CONFIG;
