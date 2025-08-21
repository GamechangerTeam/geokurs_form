import React, { useState } from "react";
import DiagnosticsForm from "./DiagnosticsForm.jsx";
import ShippingForm from "./ShippingForm.jsx";

export default function App() {
  const [mode, setMode] = useState(null); // Хранит текущий режим (диагностика/отправка)

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Форма: Диагностика / Отправка
          </h1>
          <div className="flex gap-2">
            <button
              className="btn btn-outline"
              onClick={() => window.location.reload()}
            >
              Обновить
            </button>
          </div>
        </header>

        {/* Главный экран с кнопками для навигации */}
        {!mode && (
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Карточки для перехода в форму диагностики или отправки */}
            <div className="card">
              <div className="text-lg font-semibold mb-1">Диагностика</div>
              <div className="text-sm text-slate-600 mb-3">
                Фикс неисправностей, поверка, запчасти и услуги.
              </div>
              <button className="btn" onClick={() => setMode("diag")}>
                Открыть
              </button>
            </div>
            <div className="card">
              <div className="text-lg font-semibold mb-1">Отправка</div>
              <div className="text-sm text-slate-600 mb-3">
                Перевод на стадию «ОТПРАВЛЕНО В ФИЛИАЛ».
              </div>
              <button className="btn" onClick={() => setMode("ship")}>
                Открыть
              </button>
            </div>
          </div>
        )}

        {/* Форма диагностики */}
        {mode === "diag" && <DiagnosticsForm onBack={() => setMode(null)} />}

        {/* Форма отправки */}
        {mode === "ship" && <ShippingForm onBack={() => setMode(null)} />}
      </div>
    </div>
  );
}
