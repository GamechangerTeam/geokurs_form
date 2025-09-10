import React from "react";

// front/src/components/SelectedList.jsx
function SelectedList({ title, items, onRemove, onQtyChange, onPriceChange }) {
  const nf = new Intl.NumberFormat("ru-RU");
  const sum = items.reduce(
    (s, r) => s + Number(r.price || 0) * Number(r.qty || 1),
    0
  );
  const slug = (title || "list")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
        <div className="badge">Итого: {nf.format(sum)} ₸</div>
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="text-xs text-slate-500">Пусто</div>
        )}

        {items.map((r, i) => {
          const priceId = `price-${slug}-${i}`;
          const qtyId = `qty-${slug}-${i}`;

          return (
            <div key={i} className="border rounded-xl p-3 overflow-hidden">
              {/* Верх: название + инпуты + кнопка (оборачивается, не вылезает) */}
              <div className="flex flex-wrap items-end gap-3">
                {/* Название — не схлопывается */}
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-medium leading-5 truncate">
                    {r.name}
                  </div>
                </div>

                {/* Инпуты: на узких — на всю ширину, на широких — компактно */}
                <div className="flex items-end gap-3 w-full sm:w-auto">
                  <div className="flex flex-col">
                    <label
                      htmlFor={priceId}
                      className="text-[11px] leading-none text-slate-500 mb-1"
                    >
                      Цена
                    </label>
                    <input
                      id={priceId}
                      type="number"
                      min={0}
                      className="input w-24 md:w-28"
                      value={Number(r.price ?? 0)}
                      onChange={(e) =>
                        onPriceChange &&
                        onPriceChange(
                          i,
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      placeholder="Цена"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label
                      htmlFor={qtyId}
                      className="text-[11px] leading-none text-slate-500 mb-1"
                    >
                      Кол-во
                    </label>
                    <input
                      id={qtyId}
                      type="number"
                      min={1}
                      className="input w-20"
                      value={Number(r.qty || 1)}
                      onChange={(e) =>
                        onQtyChange &&
                        onQtyChange(i, Math.max(1, Number(e.target.value) || 1))
                      }
                      placeholder="Кол-во"
                    />
                  </div>
                </div>

                {/* Кнопка — прижимается вправо, при нехватке места уходит на новую строку */}
                <div className="ml-auto">
                  <button
                    className="btn btn-outline whitespace-nowrap"
                    onClick={() => onRemove(i)}
                  >
                    Убрать
                  </button>
                </div>
              </div>

              {/* Низ: мелким шрифтом */}
              <div className="mt-2 text-[11px] leading-tight text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="min-w-0 max-w-full truncate">
                  Название: {r.name}
                </span>
                <span>·</span>
                <span>ID: {r.id}</span>
                <span>·</span>
                <span>Цена: {nf.format(Number(r.price || 0))} ₸</span>
                <span>·</span>
                <span>Кол-во: {Number(r.qty || 1)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SelectedList;
