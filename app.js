import {
  STATES,
  FILTERS,
  canonical,
  reduce,
  validateImport,
  stateExport,
  filteredProducts,
} from "./state.js";
import {
  mapSVG,
  mobileMarkup,
  labels,
  esc,
  scenarios,
  anchor,
  unanchor,
} from "./render.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
let data,
  ring,
  state,
  savedPlacements = {},
  storageKey,
  mode = "explore",
  selected = null,
  lastCard = null,
  drag = null,
  suppressClick = false;
let view = {
  pip: true,
  roadmap: false,
  scenario: "",
  zoom: 1,
  pan: { x: 0, y: 0 },
};
let toastTimer;
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function storageRead() {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    notify("localStorage недоступен. Используй Export JSON для сохранения.");
    return null;
  }
}
function persist() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...state, placementsOverride: savedPlacements }),
    );
    return true;
  } catch {
    notify(
      "Не удалось сохранить локально. Текущее состояние доступно через Export JSON.",
    );
    return false;
  }
}
function syncURL({ clearClean = true } = {}) {
  const u = new URL(location.href);
  u.searchParams.set("state", state.reveal);
  if (clearClean) u.searchParams.delete("clean");
  history.replaceState(null, "", u);
}
function dirty() {
  return (
    JSON.stringify(state.placementsOverride) !== JSON.stringify(savedPlacements)
  );
}
function syncControls() {
  $("#state-select").value = state.reveal;
  $("#step-label").textContent = state.reveal;
  $("#previous").disabled = state.reveal === STATES[0];
  $("#next").disabled = state.reveal === STATES.at(-1);
  $$("[data-preset]").forEach((b) =>
    b.setAttribute("aria-current", String(b.dataset.preset === state.reveal)),
  );
  $("#legend-toggle").checked = state.legend;
  $("#pip-toggle").checked = view.pip;
  $("#roadmap-toggle").checked = view.roadmap;
  $$("#visibility input").forEach(
    (e) => (e.checked = state.visibleIds.includes(e.value)),
  );
  $$("#filters select").forEach(
    (e) => (e.value = state.filters[e.dataset.filter]),
  );
  $("#zoom").value = String(view.zoom * 100);
  $("#zoom-label").textContent = `${Math.round(view.zoom * 100)}%`;
  $("#dirty").classList.toggle("unsaved", dirty());
  $("#dirty").textContent = dirty()
    ? "● Есть несохранённые ручные позиции"
    : Object.keys(savedPlacements).length
      ? "✓ Локальные позиции сохранены"
      : "Каноническое размещение";
  $("#save").disabled = !dirty();
  const expired = Date.now() > Date.parse(ring.expiresAt);
  $("#freshness").textContent = expired
    ? "△ Внешний круг старше 24 часов. Перед записью обнови scripts/refresh-ring.py."
    : `Внешний круг проверен ${ring.checkedAt.slice(0, 16).replace("T", " ")} UTC. Обновить до ${ring.expiresAt.slice(0, 16).replace("T", " ")} UTC.`;
}
function render({ keepFocus = true } = {}) {
  const focused = keepFocus
    ? document.activeElement?.closest("[data-product]")?.dataset.product
    : null;
  $("#map").innerHTML = mapSVG(data, ring, state, { ...view, selected });
  $("#mobile-list").innerHTML = mobileMarkup(data, ring, state);
  $("#mobile-disclaimer").textContent =
    data.disclaimer + " · Проверка источников: " + data.checkedAt;
  $("#scenario-note").hidden = !view.scenario;
  $("#scenario-note").textContent = view.scenario
    ? scenarios[view.scenario].explanation
    : "";
  syncControls();
  if (focused) focusCard(focused);
}
function focusCard(id) {
  const els = $$(`[data-product="${id}"]`);
  const target = els.find((e) => e.getBoundingClientRect().width > 0);
  target?.focus({ preventScroll: true });
}
function dispatch(action) {
  const preset = ["preset", "next", "previous"].includes(action.type);
  state = reduce(data, state, action);
  if (preset) {
    savedPlacements = {};
    selected = null;
    view = {
      ...view,
      zoom: 1,
      pan: { x: 0, y: 0 },
      roadmap: false,
      scenario: "",
    };
    $("#scenario").value = "";
    if ($("#detail").open) $("#detail").close();
  }
  persist();
  syncURL();
  render();
  if (preset)
    notify(`Состояние ${state.reveal}. На карте: ${state.visibleIds.length}.`);
  if (action.type === "filter" || action.type === "clearFilters")
    notify(
      `По фильтрам видно ${filteredProducts(data, state).length} карточек. Положения не изменены.`,
    );
}
function setMode(next) {
  mode = next;
  document.body.dataset.mode = mode;
  $$("button[data-mode]").forEach((e) =>
    e.setAttribute("aria-pressed", String(e.dataset.mode === mode)),
  );
  if (mode === "audience") {
    toggleControls(false);
    notify(
      "Чистый экран. P или двойное нажатие на заголовок возвращает управление.",
    );
  }
  if (mode === "present")
    notify(
      "Режим ведущего. P: управление; N/B: шаги. Drag и Alt + стрелки меняют локальные позиции.",
    );
  render();
}
function drawerModality() {
  const modal =
    !$("#presenter").hidden && matchMedia("(max-width:1000px)").matches;
  $("#presenter").setAttribute("role", modal ? "dialog" : "complementary");
  if (modal) $("#presenter").setAttribute("aria-modal", "true");
  else $("#presenter").removeAttribute("aria-modal");
  $("#main").inert = modal;
  $(".tools").inert = modal;
  $("#scenario-note").inert = modal;
}
function toggleControls(open = $("#presenter").hidden) {
  // A mobile full-screen drawer is modal; the desktop drawer is non-modal.
  $("#presenter").hidden = !open;
  $("#open-controls").setAttribute("aria-expanded", String(open));
  drawerModality();
  if (open) {
    if (mode !== "present") {
      mode = "present";
      document.body.dataset.mode = mode;
      $$("button[data-mode]").forEach((e) =>
        e.setAttribute("aria-pressed", String(e.dataset.mode === mode)),
      );
    }
    $("#close-controls").focus();
  } else if (mode !== "audience") $("#open-controls").focus();
}
function detailMarkup(p) {
  const entry = (title, value) =>
    `<div><dt>${title}</dt><dd>${esc(value)}</dd></div>`;
  return `<p class="micro">Урок ${p.lesson} / ${labels.depth[p.depth]}</p><h2 id="detail-title">${esc(p.name)}</h2><p>${esc(p.role)}</p>
 <div class="provenance">${p.provenance.map((k) => `<span>${labels.provenance[k]}</span>`).join("")}</div>
 ${state.placementsOverride[p.id] ? '<p class="warning">Локальная позиция изменена. Обоснование ниже относится к исходному авторскому размещению.</p>' : ""}<p class="rationale">${esc(p.placement.rationale)}</p><div class="configuration"><b>△ Граница конфигурации</b><br>${esc(p.configurationNote)}</div>
 <dl class="detail-grid">${entry("Открытость / лицензия", labels.sourceStatus[p.sourceStatus])}${entry("Свобода моделей", labels.modelFreedom[p.modelFreedom])}${entry("Размещение", p.deployments.map((d) => labels.deployments[d]).join(", ") || "Не установлено")}${entry("Интерфейсы", p.interfaces.join(" / ") || "Не установлено")}${entry("Кастомизация · учебная ступень", `${p.customization}. ${labels.customization[p.customization]}`)}${entry("Автономность · авторская полоса", labels.autonomy[p.autonomy])}${entry("Самоизменение", labels.selfModifying[p.selfModifying])}${entry("Дата реестра источников", p.checkedAt)}</dl>
 <h3>Откуда сведения</h3><ul class="source-list">${p.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>` : `<strong>${esc(s.label)}</strong> · непубличный материал; ссылка недоступна`}<br><span class="muted">${s.id} · ${s.checkedAt}<br>${esc(s.evidence)}</span></li>`).join("")}</ul><p class="hint">${esc(data.provenanceNote)}</p>
 ${mode === "present" ? `<section><h3>Локальное размещение</h3><p class="hint">Альтернатива drag. Это изменение авторской позиции, не оценка продукта.</p><div class="row"><button data-move="left" aria-label="Переместить карточку влево">←</button><button data-move="up" aria-label="Переместить карточку вверх">↑</button><button data-move="down" aria-label="Переместить карточку вниз">↓</button><button data-move="right" aria-label="Переместить карточку вправо">→</button></div><p><button id="hide-selected">Скрыть продукт</button></p></section>` : ""}`;
}
function openDetail(id) {
  const p = data.products.find((p) => p.id === id);
  if (!p) return;
  selected = id;
  lastCard = id;
  render({ keepFocus: false });
  $("#detail-content").innerHTML = detailMarkup(p);
  $("#detail").showModal();
  $("#close-detail").focus();
}
function closeDetail() {
  if ($("#detail").open) $("#detail").close();
}
function moveCard(id, direction) {
  const p = data.products.find((p) => p.id === id),
    current = state.placementsOverride[id] || p.placement;
  const delta = {
    left: [-0.025, 0],
    right: [0.025, 0],
    up: [0, 0.025],
    down: [0, -0.025],
  }[direction];
  dispatch({
    type: "place",
    id,
    placement: {
      x: Math.max(0, Math.min(1, current.x + delta[0])),
      y: Math.max(0, Math.min(1, current.y + delta[1])),
    },
  });
  notify(
    "Позиция изменена. Сохрани local override, чтобы она пережила reload.",
  );
}
function download(content, type, name) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function exportFrame(format) {
  try {
    const viewport = $("#export-size").value === "viewport";
    const width = viewport ? innerWidth : 1920,
      height = viewport ? innerHeight : 1080;
    const svg = mapSVG(data, ring, state, {
      ...view,
      interactive: false,
      selected: null,
      exporting: true,
      width,
      height,
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    const name = `harness-map-${state.reveal}-${width}x${height}`;
    if (format === "svg") download(svg, "image/svg+xml", name + ".svg");
    else {
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw Error("Canvas недоступен");
        ctx.fillStyle = "#0F0F12";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw Error("PNG encoder недоступен");
        download(blob, "image/png", name + ".png");
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    notify(
      `${format.toUpperCase()} ${width}×${height}: карта fit, дата, легенда и оговорка включены.`,
    );
  } catch (err) {
    notify(`Экспорт не выполнен: ${err.message}. Попробуй SVG.`);
  }
}
function eventBindings() {
  $$("button[data-mode]").forEach((e) =>
    e.addEventListener("click", () => setMode(e.dataset.mode)),
  );
  $("#open-controls").onclick = () => toggleControls($("#presenter").hidden);
  $("#close-controls").onclick = () => toggleControls(false);
  $("#next").onclick = () => dispatch({ type: "next" });
  $("#previous").onclick = () => dispatch({ type: "previous" });
  $("#state-select").onchange = (e) =>
    dispatch({ type: "preset", reveal: e.target.value });
  $$("[data-preset]").forEach(
    (e) =>
      (e.onclick = () =>
        dispatch({ type: "preset", reveal: e.dataset.preset })),
  );
  $("#legend-toggle").onchange = (e) =>
    dispatch({ type: "legend", value: e.target.checked });
  $("#pip-toggle").onchange = (e) => {
    view.pip = e.target.checked;
    render();
  };
  $("#roadmap-toggle").onchange = (e) => {
    view.roadmap = e.target.checked;
    render();
  };
  $("#scenario").onchange = (e) => {
    view.scenario = e.target.value;
    $("#toast").hidden = true;
    render();
  };
  $("#visibility").onchange = (e) =>
    dispatch({
      type: "visibility",
      id: e.target.value,
      visible: e.target.checked,
    });
  $("#filters").onchange = (e) =>
    dispatch({
      type: "filter",
      key: e.target.dataset.filter,
      value: e.target.value,
    });
  $("#clear-filters").onclick = () => dispatch({ type: "clearFilters" });
  $("#zoom").oninput = (e) => {
    view.zoom = Number(e.target.value) / 100;
    render();
  };
  $$("[data-pan]").forEach(
    (e) =>
      (e.onclick = () => {
        const directions = {
            left: [-70, 0],
            right: [70, 0],
            up: [0, -60],
            down: [0, 60],
          },
          [x, y] = directions[e.dataset.pan];
        view.pan = {
          x: Math.max(-500, Math.min(500, view.pan.x + x)),
          y: Math.max(-350, Math.min(350, view.pan.y + y)),
        };
        render();
      }),
  );
  $("#fit").onclick = () => {
    view.zoom = 1;
    view.pan = { x: 0, y: 0 };
    render();
  };
  $("#save").onclick = () => {
    const previous = savedPlacements;
    savedPlacements = structuredClone(state.placementsOverride);
    if (!persist()) {
      savedPlacements = previous;
      syncControls();
      return;
    }
    syncControls();
    notify("Локальное размещение сохранено. Канонический набор не изменён.");
  };
  $("#reset").onclick = () => $("#confirm-reset").showModal();
  $("#cancel-reset").onclick = () => $("#confirm-reset").close();
  $("#confirm-reset-button").onclick = () => {
    state = canonical(data, 0);
    savedPlacements = {};
    selected = null;
    view = {
      pip: true,
      roadmap: false,
      scenario: "",
      zoom: 1,
      pan: { x: 0, y: 0 },
    };
    $("#scenario").value = "";
    let cleared = true;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      cleared = false;
    }
    syncURL();
    render();
    $("#confirm-reset").close();
    $("#reset").focus();
    notify(
      cleared
        ? "Reset: L1 start, локальные позиции и фильтры удалены."
        : "Поле сброшено, но localStorage очистить не удалось. Старое сохранение может вернуться при reload.",
    );
  };
  $("#export-json").onclick = () =>
    download(
      JSON.stringify(stateExport(data, state), null, 2) + "\n",
      "application/json",
      `harness-map-${state.reveal}.json`,
    );
  $("#import-json").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100 * 1024) throw Error("Файл больше 100 КБ");
      const imported = validateImport(data, await file.text());
      state = imported;
      selected = null;
      view = {
        ...view,
        zoom: 1,
        pan: { x: 0, y: 0 },
        roadmap: false,
        scenario: "",
      };
      $("#scenario").value = "";
      persist();
      syncURL();
      render();
      notify(
        "JSON принят. Ручные позиции импортированы в черновик; Save local override сохраняет их.",
      );
    } catch (err) {
      notify(err.message);
    } finally {
      e.target.value = "";
    }
  };
  $("#export-svg").onclick = () => exportFrame("svg");
  $("#export-png").onclick = () => exportFrame("png");
  $("#copy-link").onclick = async () => {
    const u = new URL(location.href);
    u.pathname = u.pathname.replace(/[^/]*$/, "");
    u.search = "";
    u.searchParams.set("state", state.reveal);
    u.searchParams.set("clean", "1");
    u.hash = "";
    try {
      await navigator.clipboard.writeText(u.href);
      notify(
        "Ссылка скопирована: только reveal, без фильтров и ручных позиций.",
      );
    } catch {
      $("#link-value").value = u.href;
      $("#link-dialog").showModal();
      $("#link-value").select();
    }
  };
  $("#close-link").onclick = () => $("#link-dialog").close();
  $("#close-detail").onclick = closeDetail;
  $("#detail").addEventListener("close", () => {
    selected = null;
    render({ keepFocus: false });
    focusCard(lastCard);
  });
  $("#detail-content").onclick = (e) => {
    const move = e.target.closest("[data-move]");
    if (move && selected) {
      moveCard(selected, move.dataset.move);
      return;
    }
    if (e.target.closest("#hide-selected")) {
      const id = selected;
      closeDetail();
      dispatch({ type: "visibility", id, visible: false });
      $("#open-controls").focus();
    }
  };
  $("#main").addEventListener("click", (e) => {
    const card = e.target.closest("[data-product]");
    if (!card) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    openDetail(card.dataset.product);
  });
  $("#main").addEventListener("keydown", (e) => {
    const card = e.target.closest("[data-product]");
    if (!card) return;
    if (
      (e.key === "Enter" || e.key === " ") &&
      card.tagName.toLowerCase() !== "button"
    ) {
      e.preventDefault();
      openDetail(card.dataset.product);
    }
    if (mode === "present" && e.altKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      e.stopPropagation();
      moveCard(card.dataset.product, e.key.slice(5).toLowerCase());
    }
  });
  $("#map").addEventListener("pointerdown", (e) => {
    const card = e.target.closest("[data-product]");
    if (mode !== "present" || !card || e.button !== 0) return;
    const svg = $("#map svg");
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = data.products.find((p) => p.id === card.dataset.product);
    const start = anchor(state.placementsOverride[p.id] || p.placement);
    drag = {
      id: p.id,
      startX: e.clientX,
      startY: e.clientY,
      original: start,
      matrix: matrix.inverse(),
      moved: false,
    };
    $("#map").setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  $("#map").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) * drag.matrix.a) / view.zoom,
      dy = ((e.clientY - drag.startY) * drag.matrix.d) / view.zoom;
    if (Math.hypot(dx, dy) < 5 && !drag.moved) return;
    drag.moved = true;
    const placement = unanchor(drag.original.x + dx, drag.original.y + dy);
    state = reduce(data, state, { type: "place", id: drag.id, placement });
    render({ keepFocus: false });
  });
  function endDrag(e) {
    if (!drag) return;
    const item = drag;
    drag = null;
    if ($("#map").hasPointerCapture(e.pointerId))
      $("#map").releasePointerCapture(e.pointerId);
    if (item.moved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 100);
      persist();
      render();
      focusCard(item.id);
      notify("Ручная позиция не сохранена. Используй Save local override.");
    } else openDetail(item.id);
  }
  $("#map").addEventListener("pointerup", endDrag);
  $("#map").addEventListener("pointercancel", (e) => {
    drag = null;
    if ($("#map").hasPointerCapture(e.pointerId))
      $("#map").releasePointerCapture(e.pointerId);
  });
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($$("dialog[open]").length) return;
    if (e.key === "Escape" && !$("#presenter").hidden) {
      toggleControls(false);
      return;
    }
    if (
      e.key === "Tab" &&
      $("#presenter").getAttribute("aria-modal") === "true"
    ) {
      const focusables = [
        ...$("#presenter").querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select,summary,a[href]",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = focusables[0],
        last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    const form = e.target.closest("input,select,textarea");
    if (form) return;
    if (e.key.toLowerCase() === "p") {
      e.preventDefault();
      toggleControls($("#presenter").hidden);
      return;
    }
    if (
      mode === "present" &&
      ["n", "N", "ArrowRight", "b", "B", "ArrowLeft"].includes(e.key)
    ) {
      e.preventDefault();
      dispatch({
        type: ["n", "N", "ArrowRight"].includes(e.key) ? "next" : "previous",
      });
    }
  });
  $(".mobile-heading").ondblclick = () => {
    if (mode === "audience") toggleControls(true);
  };
  $("#map").ondblclick = (e) => {
    const box = $("#map svg").getBoundingClientRect();
    if (mode === "audience" && e.clientY < box.top + (box.width * 145) / 1920)
      toggleControls(true);
  };
  window.addEventListener("resize", drawerModality);
  window.addEventListener("beforeunload", (e) => {
    if (dirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("popstate", () => {
    const reveal = new URL(location.href).searchParams.get("state");
    if (STATES.includes(reveal)) {
      state = canonical(data, reveal);
      savedPlacements = {};
      selected = null;
      if ($("#detail").open) $("#detail").close();
      render();
    }
  });
}
async function loadJSON(relative) {
  const url = new URL(relative, import.meta.url).href;
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw Error(`Локальный файл ${relative}: HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    if (location.protocol !== "file:") throw err;
    const mod = await import(url.replace(/\.json$/, ".js"));
    return mod.default;
  }
}
async function init() {
  [data, ring] = await Promise.all([
    loadJSON("./data/products.json"),
    loadJSON("./data/external-ring.json"),
  ]);
  storageKey = `ai-tsekh:harness-map:${data.datasetVersion}`;
  const url = new URL(location.href),
    reveal = url.searchParams.get("state");
  state = canonical(data, STATES.includes(reveal) ? reveal : 8);
  if (reveal && !STATES.includes(reveal))
    notify("Неизвестный state в ссылке: открыта финальная карта.");
  if (url.searchParams.get("clean") !== "1") {
    const saved = storageRead();
    if (saved)
      try {
        const parsed = validateImport(data, saved);
        if (!reveal || parsed.reveal === reveal) {
          state = parsed;
          savedPlacements = structuredClone(state.placementsOverride);
        }
      } catch (err) {
        notify("Локальное состояние не принято: " + err.message);
      }
  }
  if (url.searchParams.get("mode") === "audience") mode = "audience";
  $("#state-select").innerHTML = STATES.map(
    (s, i) => `<option value="${s}">${i} · ${s}</option>`,
  ).join("");
  $("#visibility").innerHTML = data.products
    .map(
      (p) =>
        `<label class="check"><input type="checkbox" value="${p.id}" aria-label="Видимость ${esc(p.name)}">${esc(p.name)} <span class="muted">/ L${p.lesson}</span></label>`,
    )
    .join("");
  const titles = {
    sourceStatus: "Открытость кода",
    modelFreedom: "Свобода моделей",
    depth: "Глубина разбора",
    customization: "Кастомизация, от ступени",
    selfModifying: "Самоизменение",
    interfaces: "Интерфейс",
    deployments: "Размещение",
    autonomy: "Автономность",
  };
  $("#filters").innerHTML = Object.entries(FILTERS)
    .map(
      ([k, values]) =>
        `<label for="filter-${k}">${titles[k]}</label><select id="filter-${k}" data-filter="${k}">${values.map((v) => `<option value="${v}">${v ? esc(labels[k]?.[v] || v) : "Все"}</option>`).join("")}</select>`,
    )
    .join("");
  eventBindings();
  document.body.dataset.mode = mode;
  syncURL({ clearClean: false });
  render();
  $("#loading").hidden = true;
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(new URL("./sw.js", import.meta.url).href);
      await navigator.serviceWorker.ready;
      $("#offline").textContent =
        "Офлайн-кэш готов. После первого открытия карта и экспорт работают без сети.";
    } catch {
      $("#offline").textContent =
        "Офлайн-кэш недоступен. Локальный сервер работает без интернета; не останавливай его.";
    }
  } else
    $("#offline").textContent =
      "Service worker недоступен; используй локальный сервер без интернета.";
}
init().catch((err) => {
  $("#loading").textContent =
    "Карта не загрузилась: " +
    err.message +
    ". Запусти npm start и открой /map.";
});
