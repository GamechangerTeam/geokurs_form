import React, { useState, useEffect } from "react";
import { http } from "./config"; // Импортируем функцию http
import ProductSearch from "./components/ProductSearch.jsx"; // Импортируем компонент для поиска приборов

// Форма отправки
function ShippingForm({ onBack }) {
  const [serial, setSerial] = useState(""); // Серийный номер
  const [item, setItem] = useState(null); // Найденный прибор
  const [lastSearched, setLastSearched] = useState(""); // Последний введенный серийный номер
  const [msg, setMsg] = useState(null); // Сообщения об ошибках/успехах
  const [busy, setBusy] = useState(false); // Индикатор загрузки
  const [stageId, setStageId] = useState("DT177_11:UC_6QN2CY"); // по умолчанию «отправлено в филиал»

  // Функция для поиска прибора по серийному номеру
  async function lookup() {
    setMsg(null);
    if (!serial.trim()) return;
    try {
      const it = await http(
        "GET",
        `/api/device/by-serial/${encodeURIComponent(serial.trim())}`
      );
      setItem(it); // Сохраняем найденный прибор
      setLastSearched(serial.trim()); // Обновляем последний введенный серийный номер
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
    if (!serial.trim() && !item?.id) {
      setMsg({
        t: "warn",
        text: "Сначала введите серийный номер и найдите прибор",
      });
      return;
    }

    setBusy(true);
    setMsg(null); // Очищаем сообщение перед отправкой данных

    const payload = { stageId };
    if (item?.id) payload.itemId = item.id;
    else if (serial.trim()) payload.serial = serial.trim();

    try {
      // Отправляем запрос на изменение стадии
      const response = await http("POST", "/api/ship", payload);
      if (response.ok) {
        setMsg({ t: "ok", text: "Стадия изменена. Обновляем страницу…" });
        setTimeout(() => window.location.reload(), 1000); // Перезагружаем страницу
      } else {
        setMsg({ t: "err", text: response.error }); // Показываем ошибку от бэка
      }
    } catch (e) {
      setMsg({ t: "err", text: e.message }); // Показываем ошибку, если запрос не удался
    } finally {
      setBusy(false); // Останавливаем индикатор загрузки
    }
  }

  return (
    <div className="space-y-4">
      <button className="btn btn-outline" onClick={onBack}>
        ← Назад
      </button>

      <div className="card space-y-4">
        {/* <div className="grid sm:grid-cols-12 gap-3 items-start">
          <div className="sm:col-span-4 label">Серийный номер</div>
          <div className="sm:col-span-8 flex gap-2">
            <input
              className="input"
              value={serial}
              onChange={(e) => setSerial(e.target.value)} // Обновляем серийный номер
              placeholder="напр., SN‑12345"
              onKeyDown={(e) => {
                if (e.key === "Enter") lookup(); // По нажатию на Enter вызываем поиск
              }}
            />
            <button className="btn" onClick={lookup}>
              Найти
            </button>
          </div>
        </div> */}

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

        <div className="grid sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4 label">Название прибора</div>
          <div className="sm:col-span-8">
            <span className="badge text-sm">{item?.name || "—"}</span>
            {item?.id && <span className="badge ml-2">ID: {item.id}</span>}
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
          <div className="grid sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-4 label">Стадия</div>
            <div className="sm:col-span-8">
              <select
                className="input"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                <option value="DT177_11:CLIENT">Возвращено в офис</option>
                <option value="DT177_11:UC_6QN2CY">Отправлено в филиал</option>
                <option value="DT177_11:UC_A451TG">
                  Отправлено в СЦ (Алмата)
                </option>
                <option value="DT177_11:UC_1S13EN">Отправлен в Алматы</option>
              </select>
            </div>
          </div>
          <button className="btn" onClick={submit} disabled={busy}>
            Перевести на выбранную стадию
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShippingForm;
