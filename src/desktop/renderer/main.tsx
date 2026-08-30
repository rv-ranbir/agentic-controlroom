import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./app.css";
import "highlight.js/styles/github-dark.css";

window.addEventListener("error", (e) => console.error("[AgenticControlRoom] uncaught:", e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => console.error("[AgenticControlRoom] unhandled rejection:", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
