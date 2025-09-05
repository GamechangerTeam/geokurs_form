import React, { useState, useEffect, useMemo } from "react";
import { http } from "./config";
import ProductSearch from "./components/ProductSearch.jsx";
import SelectedList from "./components/SelectedList.jsx";
import CatalogList from "./components/CatalogList.jsx";

function DiagnosticsForm({ onBack }) {
  const [serial, setSerial] = useState("");
  const [item, setItem] = useState(null);
  const [defects, setDefects] = useState("");
  const [verification, setVerification] = useState(false);
  const [parts, setParts] = useState([]);
  const [services, setServices] = useState([]);
  const [lastSearched, setLastSearched] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const deviceName = item?.name || "—";

  const sumServices = useMemo(
    () =>
      services.reduce(
        (s, r) => s + Number(r.price || 0) * Number(r.qty || 1),
        0
      ),
    [services]
  );

  const sumParts = useMemo(
    () =>
      parts.reduce((s, p) => s + Number(p.price || 0) * Number(p.qty || 1), 0),
    [parts]
  );

  const totalSum = useMemo(
    () => sumServices + sumParts,
    [sumServices, sumParts]
  );

  // Поиск прибора по серийному (ручной)
  async function lookup() {
    setMsg(null);
    if (!serial.trim()) return;
    try {
      const it = await http(
        "GET",
        `/api/device/by-serial/${encodeURIComponent(serial.trim())}`
      );
      setItem(it);
      setMsg(null);
      setLastSearched(serial.trim());
    } catch {
      setItem(null);
      setMsg({ t: "warn", text: "Прибор не найден" });
    }
  }

  // Дебаунс-поиск при вводе
  useEffect(() => {
    const s = serial.trim();
    if (!s || s === lastSearched) return;
    const h = setTimeout(async () => {
      try {
        const it = await http(
          "GET",
          `/api/device/by-serial/${encodeURIComponent(s)}`
        );
        setItem(it);
        setMsg(null);
        setLastSearched(s);
      } catch {
        setItem(null);
        setMsg({ t: "warn", text: "Прибор не найден" });
      }
    }, 400);
    return () => clearTimeout(h);
  }, [serial, lastSearched]);

  // ---- helpers для локальной корзины (без API) ----
  const upsertWithPlusOne = (list, entry) => {
    const id = Number(entry.id);
    const idx = list.findIndex((x) => Number(x.id) === id);
    if (idx === -1) return [...list, { ...entry, qty: 1 }];
    const copy = list.slice();
    copy[idx] = { ...copy[idx], qty: Number(copy[idx].qty || 1) + 1 };
    return copy;
  };

  // ---- отправка формы (единственный POST) ----
  async function submit() {
    if (!item?.id) {
      setMsg({ t: "warn", text: "Сначала найдите прибор" });
      return;
    }

    setMsg(null);
    setBusy(true);

    const payload = {
      serial,
      defects,
      verification,
      parts: parts.map((p) => ({
        id: p.id,
        price: Number(p.price || 0),
        qty: Number(p.qty || 1),
      })),
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price || 0),
        qty: Number(s.qty || 1),
      })),
    };

    try {
      const res = await http("POST", "/api/diagnostics", payload);
      if (!res?.ok && res?.error) throw new Error(res.error);
      setMsg({ t: "ok", text: "Диагностика сохранена. Обновляем страницу…" });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMsg({ t: "err", text: e.message || "Ошибка сохранения" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button className="btn btn-outline" onClick={onBack}>
        ← Назад
      </button>

      <div className="card space-y-4">
        {/* Пикер прибора */}
        <ProductSearch
          title="Выберите прибор"
          onSelect={(selected) => {
            setItem(selected);
            const ser = (selected?.serial || "").trim();
            setSerial(ser);
            setLastSearched(ser);
          }}
        />

        {/* Название прибора */}
        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Название прибора</div>
          <div className="sm:col-span-8">
            <span className="badge text-sm">{deviceName}</span>
            {item?.id && <span className="badge ml-2">ID: {item.id}</span>}
          </div>
        </div>

        <div className="border-t" />

        {/* Неисправности */}
        <div className="grid sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4 label">Выявленные неисправности</div>
          <div className="sm:col-span-8">
            <textarea
              className="textarea"
              value={defects}
              onChange={(e) => setDefects(e.target.value)}
              placeholder="Опишите неисправности"
            />
          </div>
        </div>

        {/* Поверка */}
        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Поверка</div>
          <div className="sm:col-span-8 flex items-center gap-2">
            <input
              id="verif"
              type="checkbox"
              checked={verification}
              onChange={(e) => setVerification(e.target.checked)}
            />
            <label htmlFor="verif" className="text-sm">
              Да
            </label>
          </div>
        </div>

        <div className="border-t" />

        {/* Каталоги */}
        <div className="grid sm:grid-cols-2 gap-4">
          <CatalogList
            title="Каталог: Запчасти"
            sectionIds={[653]}
            onSelect={(part) => {
              // ТОЛЬКО локальный стейт, без API
              setParts((prev) => upsertWithPlusOne(prev, part));
              setMsg({ t: "ok", text: "Запчасть добавлена" });
            }}
          />
          <CatalogList
            title="Каталог: Услуги"
            sectionIds={[654]}
            onSelect={(service) => {
              // ТОЛЬКО локальный стейт, без API
              setServices((prev) => upsertWithPlusOne(prev, service));
              setMsg({ t: "ok", text: "Услуга добавлена" });
            }}
          />
        </div>

        {/* Выбранные позиции */}
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectedList
            title="Выбраны запчасти"
            items={parts}
            onRemove={(i) =>
              setParts((prev) => prev.filter((_, idx) => idx !== i))
            }
            onQtyChange={(i, qty) =>
              setParts((prev) =>
                prev.map((x, idx) =>
                  idx === i ? { ...x, qty: Math.max(1, Number(qty || 1)) } : x
                )
              )
            }
          />
          <SelectedList
            title="Выбраны услуги"
            items={services}
            onRemove={(i) =>
              setServices((prev) => prev.filter((_, idx) => idx !== i))
            }
            onQtyChange={(i, qty) =>
              setServices((prev) =>
                prev.map((x, idx) =>
                  idx === i ? { ...x, qty: Math.max(1, Number(qty || 1)) } : x
                )
              )
            }
          />
        </div>

        {/* Суммы */}
        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Сумма услуг</div>
          <div className="sm:col-span-8">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "KZT",
            }).format(sumServices)}
          </div>
        </div>

        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Сумма запчастей</div>
          <div className="sm:col-span-8">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "KZT",
            }).format(sumParts)}
          </div>
        </div>

        <div className="grid sm:grid-cols-12 gap-3 items-center border-t pt-2">
          <div className="sm:col-span-4 label">ИТОГО</div>
          <div className="sm:col-span-8 font-semibold text-lg">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "KZT",
            }).format(totalSum)}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            {msg && (
              <span
                className={`text-${
                  msg.t === "ok" ? "green" : msg.t === "warn" ? "amber" : "red"
                }-600`}
              >
                {msg.text}
              </span>
            )}
          </div>
          <button className="btn" onClick={submit} disabled={busy}>
            Сохранить и обновить
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiagnosticsForm;
