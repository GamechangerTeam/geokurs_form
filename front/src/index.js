import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const root = createRoot(document.getElementById("root"));
root.render(<App />);

if (import.meta && import.meta.webpackHot) {
  import.meta.webpackHot.accept();
}
