/**
 * Shared console UI — accessible modal, status badges, debounce, toast.
 */
(function () {
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  /** Map run timeline / workspace action types to badge variants. */
  const BADGE_VARIANTS = {
    info: "neutral",
    success: "ok",
    failure: "fail",
    timeout: "warn",
    open: "neutral",
    completed: "ok",
    waiting: "warn",
    blocked: "fail",
    done: "ok",
    draft_prepared: "neutral",
    sent: "ok",
    send_denied: "fail",
    send_failed: "fail",
    note: "neutral",
  };

  let modalRoot = null;
  let lastFocus = null;

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement("div");
    modalRoot.id = "ma-modal-root";
    modalRoot.className = "ma-modal-root";
    modalRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(modalRoot);
    return modalRoot;
  }

  function trapFocus(container, event) {
    if (event.key !== "Tab") return;
    const nodes = [...container.querySelectorAll(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeModal() {
    if (!modalRoot) return;
    modalRoot.innerHTML = "";
    modalRoot.classList.remove("is-open");
    document.body.classList.remove("ma-modal-open");
    if (lastFocus?.focus) lastFocus.focus();
    lastFocus = null;
  }

  function openModal({ title, bodyHtml, actions }) {
    ensureModalRoot();
    lastFocus = document.activeElement;
    const dialogId = `ma-dialog-${Date.now()}`;
    modalRoot.innerHTML = `<div class="ma-modal-backdrop" data-ma-dismiss>
      <div class="ma-modal" role="dialog" aria-modal="true" aria-labelledby="${dialogId}-title" tabindex="-1">
        <h2 class="ma-modal__title" id="${dialogId}-title">${title}</h2>
        <div class="ma-modal__body">${bodyHtml}</div>
        <div class="ma-modal__actions">${actions}</div>
      </div>
    </div>`;
    modalRoot.classList.add("is-open");
    document.body.classList.add("ma-modal-open");

    const dialog = modalRoot.querySelector(".ma-modal");
    const backdrop = modalRoot.querySelector(".ma-modal-backdrop");

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    dialog.addEventListener("keydown", (e) => trapFocus(dialog, e));

    const primary = dialog.querySelector("[data-ma-primary]");
    (primary || dialog).focus();
    return { dialog, close: closeModal };
  }

  function toast(message, type) {
    ensureModalRoot();
    let stack = document.getElementById("ma-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "ma-toast-stack";
      stack.className = "ma-toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = `ma-toast ma-toast--${type || "info"}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function statusBadge(value, label) {
    const key = String(value ?? "").toLowerCase();
    const variant = BADGE_VARIANTS[key] || "neutral";
    const text = label ?? String(value ?? "—");
    return `<span class="sync-badge sync-badge--${variant}">${text}</span>`;
  }

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Decode API/HTML entities, then escape for safe text display. */
  function textHtml(s) {
    const raw = String(s ?? "");
    if (!raw) return "";
    const el = document.createElement("textarea");
    el.innerHTML = raw;
    return escHtml(el.value);
  }

  function alertModal({ title, message }) {
    return new Promise((resolve) => {
      const { dialog, close } = openModal({
        title: escHtml(title || "Notice"),
        bodyHtml: `<p class="ma-modal__text">${escHtml(message)}</p>`,
        actions: `<button type="button" class="app-btn" data-ma-primary data-ma-ok>OK</button>`,
      });
      const finish = () => {
        close();
        resolve();
      };
      dialog.querySelector("[data-ma-ok]")?.addEventListener("click", finish);
      dialog.addEventListener("keydown", (e) => {
        if (e.key === "Escape") finish();
      });
    });
  }

  function confirmModal({ title, message, confirmLabel, cancelLabel, danger }) {
    return new Promise((resolve) => {
      const { dialog, close } = openModal({
        title: escHtml(title || "Confirm"),
        bodyHtml: `<p class="ma-modal__text">${message}</p>`,
        actions: `<button type="button" class="app-btn app-btn--ghost" data-ma-cancel>${escHtml(
          cancelLabel || "Cancel"
        )}</button>
        <button type="button" class="app-btn${danger ? " app-btn--danger" : ""}" data-ma-primary data-ma-confirm>${escHtml(
          confirmLabel || "Confirm"
        )}</button>`,
      });
      const finish = (value) => {
        close();
        resolve(value);
      };
      dialog.querySelector("[data-ma-cancel]")?.addEventListener("click", () => finish(false));
      dialog.querySelector("[data-ma-confirm]")?.addEventListener("click", () => finish(true));
      dialog.addEventListener("keydown", (e) => {
        if (e.key === "Escape") finish(false);
      });
    });
  }

  function promptModal({ title, label, defaultValue, multiline, confirmLabel }) {
    return new Promise((resolve) => {
      const fieldId = `ma-prompt-${Date.now()}`;
      const inputTag = multiline
        ? `<textarea id="${fieldId}" class="ma-modal__input" rows="5">${escHtml(defaultValue || "")}</textarea>`
        : `<input id="${fieldId}" class="ma-modal__input" type="text" value="${escHtml(
            defaultValue || ""
          )}" />`;
      const { dialog, close } = openModal({
        title: escHtml(title || "Input"),
        bodyHtml: `<label class="ma-modal__label" for="${fieldId}">${escHtml(label || "")}</label>${inputTag}`,
        actions: `<button type="button" class="app-btn app-btn--ghost" data-ma-cancel>Cancel</button>
        <button type="button" class="app-btn" data-ma-primary data-ma-confirm>${escHtml(
          confirmLabel || "OK"
        )}</button>`,
      });
      const input = dialog.querySelector(`#${fieldId}`);
      input?.focus();
      if (input && !multiline) input.select();

      const finish = (value) => {
        close();
        resolve(value);
      };
      dialog.querySelector("[data-ma-cancel]")?.addEventListener("click", () => finish(null));
      dialog.querySelector("[data-ma-confirm]")?.addEventListener("click", () =>
        finish(input?.value ?? "")
      );
      dialog.addEventListener("keydown", (e) => {
        if (e.key === "Escape") finish(null);
        if (e.key === "Enter" && !multiline && e.target === input) {
          e.preventDefault();
          finish(input.value);
        }
      });
    });
  }

  window.MailAgentUI = {
    alert: alertModal,
    confirm: confirmModal,
    prompt: promptModal,
    toast,
    debounce,
    statusBadge,
    esc: escHtml,
    text: textHtml,
  };
})();
