import React from "react";

function SelectedList({ title, items, onRemove, onQtyChange }) {
  const sum = items.reduce(
    (s, r) => s + Number(r.price || 0) * Number(r.qty || 1),
    0
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
        <div className="badge">
          Итого: {new Intl.NumberFormat().format(sum)} ₸
        </div>
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <div className="text-xs text-slate-500">Пусто</div>
        )}
        {items.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between border rounded-xl px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium">{r.name}</div>
              <div className="text-xs text-slate-500">
                ID: {r.id} · {new Intl.NumberFormat().format(r.price || 0)} ₸
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="input w-20"
                value={Number(r.qty || 1)}
                onChange={(e) =>
                  onQtyChange &&
                  onQtyChange(i, Math.max(1, Number(e.target.value) || 1))
                }
              />
              <button className="btn btn-outline" onClick={() => onRemove(i)}>
                Убрать
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SelectedList;
