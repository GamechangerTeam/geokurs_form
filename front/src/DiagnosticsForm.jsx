import React, { useState, useEffect, useMemo } from "react";
import { http } from "./config"; // Импортируем функцию http
import ProductSearch from "./components/ProductSearch.jsx"; // Импортируем компонент для поиска приборов
import SelectedList from "./components/SelectedList.jsx";
import CatalogList from "./components/CatalogList.jsx";

// Форма диагностики
function DiagnosticsForm({ onBack }) {
  const [serial, setSerial] = useState(""); // Серийный номер
  const [item, setItem] = useState(null); // Найденный прибор
  const [defects, setDefects] = useState(""); // Выявленные неисправности
  const [verification, setVerification] = useState(false); // Поверка
  const [parts, setParts] = useState([]); // Выбранные запчасти
  const [services, setServices] = useState([]); // Выбранные услуги
  const [lastSearched, setLastSearched] = useState(""); // Последний введенный серийный номер
  const [msg, setMsg] = useState(null); // Сообщение об ошибках/успехах
  const [busy, setBusy] = useState(false);

  const deviceName = item?.name || "—"; // Название прибора
  const sumServices = useMemo(
    () =>
      services.reduce(
        (s, r) => s + Number(r.price || 0) * Number(r.qty || 1),
        0
      ),
    [services]
  ); // Сумма услуг

  // Функция поиска прибора по серийному номеру
  async function lookup() {
    setMsg(null);
    if (!serial.trim()) return;
    try {
      const it = await http(
        "GET",
        `/api/device/by-serial/${encodeURIComponent(serial.trim())}`
      );
      setItem(it); // Сохраняем найденный прибор
      setMsg(null);
      setLastSearched(serial.trim());
    } catch (e) {
      setItem(null);
      setMsg({ t: "warn", text: "Прибор не найден" }); // Показываем сообщение об ошибке
    }
  }

  // Дебаунсинг для поиска прибора
  useEffect(() => {
    const s = serial.trim();
    if (!s || s === lastSearched) return;
    const h = setTimeout(async () => {
      try {
        const it = await http(
          "GET",
          `/api/device/by-serial/${encodeURIComponent(s)}`
        );
        setItem(it); // Сохраняем найденный прибор
        setMsg(null);
        setLastSearched(s); // Обновляем последний введенный серийный номер
      } catch (e) {
        setItem(null);
        setMsg({ t: "warn", text: "Прибор не найден" }); // Показываем сообщение об ошибке
      }
    }, 400);
    return () => clearTimeout(h); // Очистка таймера
  }, [serial, lastSearched]);

  // Функция отправки данных на сервер
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
      parts,
      services,
    };

    try {
      const response = await http("POST", "/api/diagnostics", payload);
      setMsg({ t: "ok", text: "Диагностика сохранена. Обновляем страницу…" });
      setTimeout(() => window.location.reload(), 1000); // Перезагружаем страницу
    } catch (e) {
      setMsg({ t: "err", text: e.message }); // Показываем ошибку
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

        {/* Выводим название прибора */}
        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Название прибора</div>
          <div className="sm:col-span-8">
            <span className="badge text-sm">{deviceName}</span>
            {item?.id && <span className="badge ml-2">ID: {item.id}</span>}
          </div>
        </div>

        <div className="border-t" />

        {/* Поле для выявленных неисправностей */}
        <div className="grid sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4 label">Выявленные неисправности</div>
          <div className="sm:col-span-8">
            <textarea
              className="textarea"
              value={defects}
              onChange={(e) => setDefects(e.target.value)} // Обновляем неисправности
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
              onChange={(e) => setVerification(e.target.checked)} // Обновляем состояние поверки
            />
            <label htmlFor="verif" className="text-sm">
              Да
            </label>
          </div>
        </div>

        <div className="border-t" />

        {/* Каталоги запчастей и услуг */}
        <div className="grid sm:grid-cols-2 gap-4">
          <CatalogList
            title="Каталог: Запчасти"
            sectionIds={[653]}
            onSelect={async (part) => {
              const withQty = { ...part, qty: 1 };
              setParts((prev) => [...prev, withQty]);
              try {
                if (item?.id) {
                  const spaRows = [
                    ...parts.map((p) => ({
                      productId: Number(p.id),
                      price: Number(p.price || 0),
                      quantity: Number(p.qty || 1),
                    })),
                    {
                      productId: Number(withQty.id),
                      price: Number(withQty.price || 0),
                      quantity: 1,
                    },
                  ];
                  await http(
                    "POST",
                    `/api/item/${encodeURIComponent(item.id)}/productrows/set`,
                    { rows: spaRows }
                  );
                }
                setMsg({ t: "ok", text: "Запчасть добавлена в прибор" });
              } catch (e) {
                setMsg({ t: "err", text: e.message });
              }
            }}
          />
          <CatalogList
            title="Каталог: Услуги"
            sectionIds={[654]}
            onSelect={async (service) => {
              if (!item?.dealId) {
                setMsg({ t: "warn", text: "У выбранного прибора нет сделки" });
                return;
              }
              try {
                setMsg(null);
                await http(
                  "POST",
                  `/api/deal/${encodeURIComponent(
                    item.dealId
                  )}/productrows/add`,
                  {
                    productId: Number(service.id),
                    price: Number(service.price || 0),
                    quantity: 1,
                  }
                );
                setServices((prev) => [...prev, { ...service, qty: 1 }]);
                setMsg({ t: "ok", text: "Услуга добавлена в сделку" });
              } catch (e) {
                setMsg({ t: "err", text: e.message });
              }
            }}
          />
        </div>

        {/* Списки выбранных запчастей и услуг */}
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectedList
            title="Выбраны запчасти"
            items={parts}
            onRemove={(i) =>
              setParts((prev) => prev.filter((_, idx) => idx !== i))
            }
            onQtyChange={(i, qty) =>
              setParts((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, qty } : x))
              )
            }
          />
          <SelectedList
            title="Выбраны услуги"
            items={services}
            onRemove={(i) =>
              setServices((prev) => prev.filter((_, idx) => idx !== i))
            }
            onQtyChange={async (i, qty) => {
              setServices((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, qty } : x))
              );
              try {
                if (item?.dealId) {
                  const rows = services.map((s, idx) => ({
                    productId: Number(s.id),
                    price: Number(s.price || 0),
                    quantity: Number(idx === i ? qty : s.qty || 1),
                  }));
                  await http(
                    "POST",
                    `/api/deal/${encodeURIComponent(
                      item.dealId
                    )}/productrows/set`,
                    { rows }
                  );
                }
                setMsg({ t: "ok", text: "Количество обновлено" });
              } catch (e) {
                setMsg({ t: "err", text: e.message });
              }
            }}
          />
        </div>

        {/* Сумма за услуги */}
        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Сумма услуг (авто)</div>
          <div className="sm:col-span-8 font-semibold">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "KZT",
            }).format(sumServices)}{" "}
            {/* Отображаем сумму услуг в KZT */}
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
