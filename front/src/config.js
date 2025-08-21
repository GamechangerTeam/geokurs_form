const API_BASE =
  typeof window !== "undefined" && window.__API_BASE__
    ? window.__API_BASE__
    : "";

const http = async (method, url, body) => {
  const headers = {};

  // Добавляем заголовок для пропуска страницы ngrok
  if ((API_BASE || "").includes("ngrok")) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    await res.text();
    throw new Error(
      "Похоже, это страница ngrok (ERR_NGROK_6024). Проверь API_BASE или заголовок ngrok-skip-browser-warning."
    );
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || j.details || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
};

export { API_BASE, http }; // Экспортируем и http, и API_BASE
