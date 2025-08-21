import React, { useState, useEffect, useRef } from "react";
import { http } from "../config.js"; // Функция для запросов

// Компонент для поиска приборов по серийному номеру
function ProductSearch({ title = "Выберите прибор", onSelect }) {
  const [q, setQ] = useState(""); // Ввод пользователя
  const [list, setList] = useState([]); // Список найденных приборов
  const [loading, setLoading] = useState(false); // Индикатор загрузки
  const skipNextFetchRef = useRef(false); // Флаг для подавления следующего запроса после выбора

  useEffect(() => {
    if (skipNextFetchRef.current) {
      // Пропускаем один цикл эффекта после программного заполнения инпута
      skipNextFetchRef.current = false;
      return;
    }

    const trimmed = q.trim();
    const timeoutId = setTimeout(async () => {
      if (!trimmed) {
        setList([]); // Очистка списка, если поиск пустой
        return;
      }
      setLoading(true);
      try {
        const res = await http(
          "GET",
          `/api/device/by-serial/${encodeURIComponent(trimmed)}`
        );
        setList(res); // Загружаем список приборов
      } catch {
        setList([]); // Ошибка поиска
      }
      setLoading(false);
    }, 400); // Дебаунсинг, чтобы не делать запросы слишком часто

    return () => clearTimeout(timeoutId); // Очистка таймера
  }, [q]);

  const handleSelect = (item) => {
    if (onSelect) {
      onSelect(item); // Передаем выбранный прибор в родительский компонент
      skipNextFetchRef.current = true; // Подавляем следующий запрос
      setQ(item?.serial || ""); // Подставляем серийный номер выбранного элемента в инпут
      setList([]); // Очищаем список
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          className="input"
          placeholder="Введите серийный номер..."
          value={q}
          onChange={(e) => setQ(e.target.value)} // Запуск поиска при изменении текста
        />
      </div>
      {/* Список найденных приборов (пикер) */}
      {q && list.length > 0 && (
        <div className="max-h-56 overflow-auto space-y-2 mt-2">
          {loading && <div className="text-xs text-slate-500">Ищем...</div>}
          {!loading && list.length === 0 && (
            <div className="text-xs text-slate-500">Ничего не нашли</div>
          )}
          <ul>
            {list.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between border rounded-xl px-3 py-2 cursor-pointer"
                onClick={() => handleSelect(p)} // Выбор элемента
              >
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    ID: {p.id} · {p.serial}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ProductSearch;
