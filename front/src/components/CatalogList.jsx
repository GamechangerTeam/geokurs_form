import React, { useEffect, useMemo, useState } from "react";
import { http } from "../config.js";

function CatalogList({ title, sectionIds, onSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qs =
          Array.isArray(sectionIds) && sectionIds.length
            ? `?ids=${sectionIds.join(",")}`
            : "";
        const list = await http("GET", `/api/products/sections${qs}`);
        if (!isCancelled) setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!isCancelled) setErr(e.message || "Ошибка загрузки");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, [JSON.stringify(sectionIds || [])]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      String(it.name || "")
        .toLowerCase()
        .includes(term)
    );
  }, [q, items]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          className="input"
          placeholder="Фильтр по названию..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading && <div className="text-xs text-slate-500">Загрузка...</div>}
      {err && <div className="text-xs text-red-600">{err}</div>}
      {!loading && !err && (
        <div className="max-h-64 overflow-auto space-y-2">
          {filtered.length === 0 && (
            <div className="text-xs text-slate-500">Пусто</div>
          )}
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between border rounded-xl px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    ID: {p.id} · {new Intl.NumberFormat().format(p.price || 0)}{" "}
                    ₸
                  </div>
                </div>
                <button
                  className="btn btn-outline"
                  onClick={() => onSelect && onSelect({ ...p, qty: 1 })}
                >
                  Добавить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CatalogList;
