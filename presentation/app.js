(() => {
  "use strict";

  window.__presentationErrors = [];
  window.addEventListener("error", (event) => window.__presentationErrors.push(event.message || "window error"));
  window.addEventListener("unhandledrejection", (event) => window.__presentationErrors.push(String(event.reason || "unhandled rejection")));

  const app = document.getElementById("app");
  const stage = document.getElementById("stage");

  const ROOT_BASE = (() => {
    let seg = location.pathname.replace(/[^/]*$/, "");
    const idx = seg.indexOf("/presentation/");
    if (idx >= 0) seg = seg.slice(0, idx + "/presentation/".length);
    return seg;
  })();
  const withBase = (p) => ROOT_BASE.replace(/\/$/, "") + p;

  const drawer = document.getElementById("source-drawer");
  const sourceList = document.getElementById("source-list");
  const notes = document.getElementById("presenter-notes");
  const progress = document.getElementById("progress");
  const toast = document.getElementById("toast");
  const jumpDialog = document.getElementById("jump-dialog");
  const jumpForm = document.getElementById("jump-form");
  const jumpInput = document.getElementById("jump-input");
  const presenterBar = document.querySelector(".presenter-bar");
  const storagePrefix = "ai-harnesses-presentation:v1";

  let data;
  let currentLesson = null;
  let currentScreen = null;
  let reveal = 0;
  let controlsTimer = 0;
  let toastTimer = 0;
  let sourceReturnFocus = null;

  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
  const isPresenter = () => new URLSearchParams(location.search).get("present") === "1";
  const screenKey = (lesson) => `${storagePrefix}:lesson:${lesson}`;
  const allScreens = () => data.lessons.flatMap((lesson) => lesson.screens);
  const findScreen = (id) => allScreens().find((screen) => screen.id === id);
  const findLesson = (number) => data.lessons.find((lesson) => lesson.number === Number(number));
  const maxReveal = (screen = currentScreen) => screen ? screen.reveals.length : 0;


  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function validatePayload(payload) {
    if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.lessons)) {
      throw new Error("Неизвестная схема presentation.json");
    }
    const ids = new Set();
    for (const lesson of payload.lessons) {
      for (const screen of lesson.screens || []) {
        if (!/^P[1-4]-\d{2}$/.test(screen.id) || ids.has(screen.id)) {
          throw new Error(`Некорректный или повторный screen ID: ${screen.id}`);
        }
        ids.add(screen.id);
        if (!screen.sources.length || screen.sources.some((id) => !payload.sources[id])) {
          throw new Error(`Неполная provenance у ${screen.id}`);
        }
      }
    }
    if (ids.size !== 34) throw new Error(`Ожидалось 34 экрана, найдено ${ids.size}`);
  }

  function setShellMode() {
    const presenter = isPresenter();
    app.classList.toggle("presentation-shell", presenter);
    presenterBar.hidden = !presenter;
    notes.hidden = !presenter || !currentScreen;
    if (!presenter) app.classList.remove("controls-idle", "controls-hidden");
  }

  function updateNavigation() {
    document.querySelectorAll(".lesson-nav a").forEach((link) => {
      const active = currentLesson && link.getAttribute("href") === `/lesson/${currentLesson.number}`;
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function persist() {
    if (!currentLesson || !currentScreen) return;
    localStorage.setItem(screenKey(currentLesson.number), JSON.stringify({ id: currentScreen.id, reveal }));
  }

  function updateUrl(mode = "replace") {
    if (!currentLesson || !currentScreen) return;
    const params = new URLSearchParams(location.search);
    if (reveal > 0) params.set("reveal", String(reveal));
    else params.delete("reveal");
    const query = params.toString();
    const url = `${withBase(`/lesson/${currentLesson.number}`)}${query ? `?${query}` : ""}#${currentScreen.id}`;
    history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
  }

  function cardBadge(card) {
    if (!card.badge) return "";
    const badgeClass = card.badge === "verified" ? "verified" : card.tone === "risk" ? "warning" : "author";
    return `<span class="badge ${badgeClass}">${escapeHtml(card.badge)}</span>`;
  }

  function renderHero(content) {
    if (content.variant === "route") {
      return `<div class="hero-route">${content.items.map((item, index) => `
        <div class="route-node reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}">
          <b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.text)}</small>
        </div>`).join("")}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
    }
    return `<div class="hero-split">${content.items.map((item, index) => `
      <div class="hero-contour reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}">
        <strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span>
      </div>`).join("")}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderLayerDiagram(content) {
    return `<div class="layer-stack">${content.steps.map((item, index) => `
      <div class="layer reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}" data-cost="${escapeHtml(item.cost || "")}">
        <b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span>
      </div>`).join("")}</div><span class="qualitative">Качественная учебная схема, не измерение</span><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderCards(content, sourceProof = false) {
    const columns = Math.min(content.columns || content.cards.length || 3, 3);
    return `<div class="card-grid" style="--columns:${columns}">${content.cards.map((card, index) => {
      const tone = card.tone === "risk" ? "risk" : card.tone === "info" ? "info" : "";
      const source = sourceProof && card.source ? `<div class="card-meta"><code>${escapeHtml(card.source)}</code></div>` : "";
      return `<article class="card ${tone} reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}">
        ${cardBadge(card)}<h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.text)}</p>${source}
      </article>`;
    }).join("")}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderMatrix(content) {
    return `<div class="matrix-wrap"><table class="matrix"><thead><tr>${content.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>${content.rows.map((row, index) => `<tr class="reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}">${row.map((cell, cellIndex) => cellIndex === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderWorkflow(content) {
    return `<div class="workflow" style="--steps:${Math.min(content.steps.length, 6)}">${content.steps.map((item, index) => `
      <div class="workflow-step reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}">
        <span class="step-number">${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span>
      </div>`).join("")}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderAcceptance(content) {
    return `<div class="acceptance-grid">${content.checks.map((item, index) => `
      <div class="acceptance ${escapeHtml(item.tone)} reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}">
        <strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span><div class="status">${escapeHtml(item.status)}</div>
      </div>`).join("")}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderChecklist(content) {
    return `<ol class="checklist" style="--columns:${Math.min(content.columns || 3, 3)}">${content.items.map((item, index) => `
      <li class="reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span></div></li>`).join("")}</ol>`;
  }

  function renderDecision(content) {
    return `<div class="formula"><span>${escapeHtml(content.formula[0])}</span><span class="arrow">≠ / →</span><span>${escapeHtml(content.formula[1])}</span></div>
      <div class="card-grid" style="--columns:2;margin-top:18px">${content.items.map((item, index) => `
        <article class="card ${item.tone === "risk" ? "risk" : ""} reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join("")}</div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderStats(content) {
    const visible = reveal >= 1 ? " is-visible" : "";
    return `<div class="stats reveal${visible}" data-reveal="1">${content.stats.map((stat) => `<div class="stat"><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>`).join("")}</div>
      <div class="limitation reveal${visible}" data-reveal="1">${escapeHtml(content.limitation)}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderRing(content) {
    return `<div class="ring"><div class="ring-core">${escapeHtml(content.core)}</div><div class="ring-items">${content.items.map((item, index) => `
      <div class="ring-item reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}"><b>${escapeHtml(item.title)}</b><br><small>${escapeHtml(item.text)}</small></div>`).join("")}</div></div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderMap(content) {
    return `<div class="map-launch"><div class="map-preview" aria-label="Статичный fallback карты"><span class="map-label">${escapeHtml(content.state)} · QUALITATIVE</span></div>
      <div class="map-copy reveal${reveal >= 1 ? " is-visible" : ""}" data-reveal="1"><div><strong>${escapeHtml(content.title)}</strong><p>${escapeHtml(content.text)}</p></div>
      <button class="primary-action" type="button" data-action="map">Открыть отдельную карту</button></div></div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderPersonalStack(content) {
    return `<div class="ring"><div class="ring-core">${escapeHtml(content.core)}</div><div class="ring-items">${content.cards.map((card, index) => `
      <div class="ring-item reveal${reveal >= index + 1 ? " is-visible" : ""}" data-reveal="${index + 1}"><b>${escapeHtml(card.title)}</b><br><small>${escapeHtml(card.text)}</small></div>`).join("")}</div></div>
      <span class="qualitative">Личный/авторский контур, не универсальная рекомендация</span><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderVisual(screen) {
    const renderers = {
      Hero: renderHero,
      LayerDiagram: renderLayerDiagram,
      ParallelCards: renderCards,
      CriteriaMatrix: renderMatrix,
      Workflow: renderWorkflow,
      AcceptancePanel: renderAcceptance,
      SourceProof: (content) => renderCards(content, true),
      RiskCard: renderCards,
      ActionChecklist: renderChecklist,
      DecisionTitle: renderDecision,
      Stats: renderStats,
      Ring: renderRing,
      MapLaunch: renderMap,
      PersonalStack: renderPersonalStack
    };
    const renderer = renderers[screen.component];
    if (!renderer) throw new Error(`Неизвестный component: ${screen.component}`);
    return renderer(screen.content);
  }

  function renderScreen() {
    document.title = `${currentScreen.id} · ${currentScreen.title}`;
    stage.innerHTML = `<section class="screen" id="${escapeHtml(currentScreen.id)}" aria-labelledby="screen-title">
      <div class="screen-inner">
        <div class="screen-head"><div><span class="micro">${escapeHtml(currentScreen.micro)}</span><h1 id="screen-title">${escapeHtml(currentScreen.title)}</h1><p class="lead">${escapeHtml(currentScreen.lead)}</p></div><span class="screen-id">${escapeHtml(currentScreen.id)}</span></div>
        <div class="visual" data-component="${escapeHtml(currentScreen.component)}">${renderVisual(currentScreen)}</div>
        <p class="footer-note">Авторская учебная модель; возможности и позиции продуктов зависят от конфигурации. Проверено ${escapeHtml(currentScreen.freshness)}.</p>
      </div>
    </section>`;
    stage.querySelectorAll(".reveal").forEach((item) => {
      item.setAttribute("aria-hidden", item.classList.contains("is-visible") ? "false" : "true");
    });
    renderSources(currentScreen.sources);
    renderNotes();
    updateProgress();
    updateNavigation();
    setShellMode();
    persist();
  }

  function renderHome() {
    currentLesson = null;
    currentScreen = null;
    reveal = 0;
    document.title = "AI-харнессы · презентация модуля";
    stage.innerHTML = `<section class="home"><div class="home-inner"><span class="micro">Дополнительный модуль · 4 урока</span>
      <h1>Выбирать, переносить и развивать <em>AI-харнессы</em></h1><p class="lead">${escapeHtml(data.promise)}</p>
      <div class="lesson-list">${data.lessons.map((lesson) => `<a class="lesson-link" href="${withBase("/lesson/" + lesson.number)}" data-route><span class="lesson-no">0${lesson.number}</span><div><h2>${escapeHtml(lesson.title)}</h2><p>${escapeHtml(lesson.outcome)}</p></div><div class="lesson-meta"><span>${lesson.screens.length} экранов</span><span>${escapeHtml(lesson.duration)}</span></div></a>`).join("")}</div>
      <p class="footer-note">Стрелки и Space листают reveals. Presenter mode: добавь <code>?present=1</code>.</p></div></section>`;
    notes.hidden = true;
    progress.hidden = true;
    renderSources([]);
    updateNavigation();
    setShellMode();
  }

  function sourceBadge(source) {
    const className = source.kind === "official" || source.kind === "paper" ? "verified" : source.kind === "author-model" ? "author" : source.kind === "course" ? "warning" : "info";
    return `<span class="badge ${className}">${escapeHtml(source.kind)}</span>`;
  }

  function renderSources(ids) {
    const list = ids.map((id) => [id, data.sources[id]]).filter(([, source]) => source);
    sourceList.innerHTML = list.length ? list.map(([id, source]) => `<article class="drawer-source">${sourceBadge(source)}<h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.claim)}</p><a href="${escapeHtml(source.url)}" ${source.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(id)} · открыть источник</a><small>Проверено ${escapeHtml(source.checkedAt)} · уверенность: ${escapeHtml(source.confidence)}</small></article>`).join("") : "<p>На этом route нет экранных источников.</p>";
  }

  function renderSourcesPage() {
    currentLesson = null;
    currentScreen = null;
    reveal = 0;
    document.title = "Источники · AI-харнессы";
    const rows = Object.entries(data.sources).map(([id, source]) => `<article class="source-row" id="${escapeHtml(id)}"><code>${escapeHtml(id)}</code><div>${sourceBadge(source)}<h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.claim)}</p><a href="${escapeHtml(source.url)}" ${source.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>Открыть источник</a></div><time datetime="${escapeHtml(source.checkedAt)}">${escapeHtml(source.checkedAt)}</time></article>`).join("");
    stage.innerHTML = `<section class="sources-page"><span class="micro">Provenance · актуальность</span><h1>Факт, авторская модель и личный опыт разделены</h1><p class="lead">Product claims ведут к первичным источникам. Авторские классификации и локальные demo contracts не маскируются под отраслевой стандарт.</p><div class="source-register">${rows}</div></section>`;
    progress.hidden = true;
    notes.hidden = true;
    renderSources([]);
    updateNavigation();
    setShellMode();
  }

  function renderNotes() {
    if (!currentScreen || !isPresenter()) {
      notes.hidden = true;
      notes.innerHTML = "";
      return;
    }
    const item = currentScreen.presenterNotes;
    notes.hidden = false;
    notes.innerHTML = `<dl><dt>Реплика</dt><dd>${escapeHtml(item.cue)}</dd><dt>Дальше</dt><dd>${escapeHtml(item.next)}</dd><dt>Fallback</dt><dd>${escapeHtml(item.fallback)}</dd><dt>Риск</dt><dd>${escapeHtml(item.risk)}</dd></dl>`;
  }

  function updateProgress() {
    if (!currentLesson || !currentScreen) {
      progress.hidden = true;
      return;
    }
    const index = currentLesson.screens.findIndex((screen) => screen.id === currentScreen.id);
    progress.hidden = false;
    progress.textContent = `${String(index + 1).padStart(2, "0")} / ${String(currentLesson.screens.length).padStart(2, "0")} · ${reveal}/${maxReveal()}`;
  }

  function resolveLessonRoute(number) {
    const lesson = findLesson(number);
    if (!lesson) return renderNotFound();
    currentLesson = lesson;
    const hashId = decodeURIComponent(location.hash.slice(1));
    let target = hashId && lesson.screens.find((screen) => screen.id === hashId);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(screenKey(number)) || "null"); } catch { saved = null; }
    if (!target && saved) target = lesson.screens.find((screen) => screen.id === saved.id);
    currentScreen = target || lesson.screens[0];
    const queryReveal = Number(new URLSearchParams(location.search).get("reveal"));
    reveal = Number.isInteger(queryReveal) && queryReveal >= 0 ? Math.min(queryReveal, maxReveal()) : (target ? 0 : Math.min(saved?.reveal || 0, maxReveal()));
    updateUrl("replace");
    renderScreen();
  }

  function renderNotFound() {
    currentLesson = null;
    currentScreen = null;
    stage.innerHTML = `<section class="home"><div class="home-inner"><span class="micro">404</span><h1>Такого экрана нет</h1><p class="lead">Вернись к индексу модуля.</p><a class="primary-action" href="${withBase("/")}" data-route>На главную</a></div></section>`;
    progress.hidden = true;
    notes.hidden = true;
  }

  function route() {
    closeSources();
    const rawPath = location.pathname.startsWith(ROOT_BASE) ? location.pathname.slice(ROOT_BASE.length) : location.pathname;
    const norm = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
    const path = norm.replace(/\/$/, "") || "/";
    if (path === "/") {
      const lessonParam = Number(new URLSearchParams(location.search).get("lesson"));
      if (lessonParam >= 1 && lessonParam <= 4) {
        resolveLessonRoute(lessonParam);
        return;
      }
      if (new URLSearchParams(location.search).has("sources")) {
        renderSourcesPage();
        return;
      }
      renderHome();
    }
    else if (path === "/sources") renderSourcesPage();
    else {
      const match = path.match(/^\/lesson\/([1-4])$/);
      if (match) resolveLessonRoute(Number(match[1]));
      else renderNotFound();
    }
    window.scrollTo(0, 0);
  }

  function goToScreen(screen, nextReveal = 0, push = false) {
    const lesson = findLesson(screen.lesson);
    currentLesson = lesson;
    currentScreen = screen;
    reveal = Math.max(0, Math.min(nextReveal, maxReveal(screen)));
    updateUrl(push ? "push" : "replace");
    renderScreen();
  }

  function move(direction) {
    if (!currentLesson || !currentScreen || drawer.classList.contains("open") || jumpDialog.open) return;
    if (direction > 0 && reveal < maxReveal()) {
      reveal += 1;
      updateUrl();
      renderScreen();
      return;
    }
    if (direction < 0 && reveal > 0) {
      reveal -= 1;
      updateUrl();
      renderScreen();
      return;
    }
    const index = currentLesson.screens.findIndex((screen) => screen.id === currentScreen.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentLesson.screens.length) {
      showToast(direction > 0 ? "Конец урока" : "Начало урока");
      return;
    }
    const nextScreen = currentLesson.screens[nextIndex];
    goToScreen(nextScreen, direction < 0 ? maxReveal(nextScreen) : 0);
  }

  function resetLesson() {
    if (!currentLesson) return;
    localStorage.removeItem(screenKey(currentLesson.number));
    goToScreen(currentLesson.screens[0], 0);
    showToast(`Урок ${currentLesson.number} сброшен`);
  }

  function openSources() {
    if (!currentScreen) return;
    sourceReturnFocus = document.activeElement;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawer.querySelector("button").focus();
  }

  function closeSources() {
    if (!drawer.classList.contains("open")) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    if (sourceReturnFocus instanceof HTMLElement) sourceReturnFocus.focus();
    sourceReturnFocus = null;
  }

  function mapStateForScreen() {
    if (!currentScreen) return "L1-start";
    if (currentScreen.lesson === 1) return currentScreen.id === "P1-07" ? "L1-start" : "L1-end";
    if (currentScreen.lesson === 2) return ["P2-07", "P2-08"].includes(currentScreen.id) ? "L2-end" : "L1-end";
    if (currentScreen.lesson === 3) return currentScreen.id === "P3-09" ? "L3-end" : "L2-end";
    if (currentScreen.id === "P4-07" || currentScreen.id === "P4-09") return "Final";
    if (["P4-01", "P4-02"].includes(currentScreen.id)) return "L3-end";
    return "L4-core";
  }

  function openMap() {
    const url = `${data.mapBaseUrl}?state=${encodeURIComponent(mapStateForScreen())}`;
    window.open(url, "harness-map");
    showToast(`Карта: ${mapStateForScreen()}`);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      showToast("Fullscreen недоступен в этом браузере");
    }
  }

  function openJump() {
    if (!currentLesson) return;
    jumpInput.value = "";
    jumpDialog.showModal();
    requestAnimationFrame(() => jumpInput.focus());
  }

  function submitJump(event) {
    event.preventDefault();
    const raw = jumpInput.value.trim().toUpperCase();
    let target;
    if (/^\d{1,2}$/.test(raw)) target = currentLesson?.screens[Number(raw) - 1];
    else if (/^P[1-4]-\d{2}$/.test(raw)) target = findScreen(raw);
    if (!target) {
      showToast("Экран не найден");
      return;
    }
    jumpDialog.close();
    goToScreen(target, 0, true);
  }

  function controlsActivity() {
    if (!isPresenter() || app.classList.contains("controls-hidden")) return;
    app.classList.remove("controls-idle");
    clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(() => app.classList.add("controls-idle"), 2000);
  }

  function toggleControls() {
    const hidden = app.classList.toggle("controls-hidden");
    app.classList.remove("controls-idle");
    showToast(hidden ? "Controls скрыты" : "Controls включены");
    if (!hidden) controlsActivity();
  }

  function collectCss() {
    let css = "";
    for (const sheet of document.styleSheets) {
      try { css += Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { /* same-origin CSS only */ }
    }
    return css.replace(/<\/style/gi, "<\\/style");
  }

  function exportedSvg() {
    const screen = stage.querySelector(".screen");
    if (!screen) return null;
    const clone = screen.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.className = `app${isPresenter() ? " presentation-shell controls-hidden" : ""}`;
    wrapper.style.width = "1920px";
    wrapper.style.height = "1080px";
    clone.style.width = "1920px";
    clone.style.height = "1080px";
    clone.style.minHeight = "1080px";
    clone.querySelector(".screen-inner").style.minHeight = "1080px";
    clone.querySelectorAll(".reveal").forEach((item) => { item.style.transition = "none"; });
    wrapper.appendChild(clone);
    const serialized = new XMLSerializer().serializeToString(wrapper);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><foreignObject width="1920" height="1080"><div xmlns="http://www.w3.org/1999/xhtml"><style>${collectCss()}</style>${serialized}</div></foreignObject></svg>`;
  }

  function downloadBlob(blob, extension) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${currentScreen.id}-r${reveal}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function exportSvg() {
    const svg = exportedSvg();
    if (!svg) return;
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "svg");
    showToast("SVG export создан");
  }

  function exportPng() {
    const svg = exportedSvg();
    if (!svg) return;
    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext("2d");
      context.fillStyle = "#0F0F12";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, "png");
        else showToast("PNG export не поддерживается");
      }, "image/png");
      URL.revokeObjectURL(svgUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      showToast("Браузер запретил SVG foreignObject export");
    };
    image.src = svgUrl;
  }

  function handleAction(action) {
    const actions = {
      next: () => move(1), prev: () => move(-1), reset: resetLesson, map: openMap,
      sources: openSources, "sources-close": closeSources, fullscreen: toggleFullscreen,
      "export-svg": exportSvg, "export-png": exportPng, capture: toggleControls,
      progress: () => progress.classList.toggle("is-hidden")
    };
    actions[action]?.();
  }

  function navigateRoute(href) {
    const url = new URL(href, location.origin);
    if (!url.pathname.startsWith(ROOT_BASE) && ROOT_BASE !== "/") url.pathname = ROOT_BASE.replace(/\/$/, "") + url.pathname;
    if (isPresenter() && decodeURIComponent(url.pathname).includes("/lesson/")) url.searchParams.set("present", "1");
    history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    route();
  }

  async function runSelfTest() {
    const failures = [];
    const checks = [];
    const check = (condition, label) => {
      checks.push(label);
      if (!condition) failures.push(label);
    };
    const noOverflow = (label) => check(document.documentElement.scrollWidth <= window.innerWidth + 1, `${label}: no horizontal overflow`);

    for (const lesson of data.lessons) {
      for (const screen of lesson.screens) {
        goToScreen(screen, maxReveal(screen));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        check(stage.querySelector(".screen")?.id === screen.id, `${screen.id}: render`);
        check(stage.querySelectorAll(".reveal[aria-hidden='false']").length > 0, `${screen.id}: final reveal`);
        noOverflow(screen.id);
      }
    }

    history.replaceState({}, "", ROOT_BASE);
    route();
    check(Boolean(stage.querySelector(".home")), "route / renders module index");
    history.replaceState({}, "", withBase("/sources"));
    route();
    check(stage.querySelectorAll(".source-row").length === Object.keys(data.sources).length, "route /sources renders source register");
    for (const lesson of data.lessons) {
      history.replaceState({}, "", withBase(`/lesson/${lesson.number}`) + `?present=1#${lesson.screens[0].id}`);
      route();
      check(currentLesson?.number === lesson.number && currentScreen?.id === lesson.screens[0].id, `route /lesson/${lesson.number}`);
    }

    goToScreen(data.lessons[0].screens[0], 0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    check(reveal === 1, "keyboard ArrowRight advances reveal");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    check(reveal === 0, "keyboard ArrowUp reverses reveal");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    check(currentScreen.id === "P1-08" && reveal === maxReveal(), "keyboard End reaches lesson end");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    check(currentScreen.id === "P1-01" && reveal === 0, "keyboard Home resets position");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    check(drawer.classList.contains("open"), "keyboard S opens source drawer");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    check(!drawer.classList.contains("open"), "Escape closes source drawer");

    history.replaceState({}, "", "/lesson/3?present=1&reveal=1#P3-06");
    route();
    check(currentScreen.id === "P3-06" && reveal === 1, "deep link restores exact screen and reveal");
    resetLesson();
    check(currentScreen.id === "P3-01" && reveal === 0, "reset restores lesson start");
    check(window.__presentationErrors.length === 0, "no captured runtime errors");

    goToScreen(data.lessons[0].screens[1], maxReveal(data.lessons[0].screens[1]));
    const result = document.createElement("pre");
    result.id = "selftest-results";
    result.hidden = true;
    result.dataset.status = failures.length ? "fail" : "pass";
    result.textContent = JSON.stringify({ status: result.dataset.status, checks: checks.length, failures, runtimeErrors: window.__presentationErrors }, null, 2);
    document.body.appendChild(result);
    document.body.dataset.selftest = result.dataset.status;
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      handleAction(actionTarget.dataset.action);
      return;
    }
    const routeLink = event.target.closest("a[data-route]");
    if (routeLink) {
      event.preventDefault();
      navigateRoute(routeLink.href);
    }
  });

  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (event.key === "Escape") {
      closeSources();
      return;
    }
    const nextKeys = ["ArrowRight", "PageDown", " "];
    const prevKeys = ["ArrowLeft", "ArrowUp", "PageUp"];
    if (nextKeys.includes(event.key)) { event.preventDefault(); move(1); }
    else if (prevKeys.includes(event.key)) { event.preventDefault(); move(-1); }
    else if (event.key === "Home" && currentLesson) { event.preventDefault(); goToScreen(currentLesson.screens[0], 0); }
    else if (event.key === "End" && currentLesson) { event.preventDefault(); const last = currentLesson.screens.at(-1); goToScreen(last, maxReveal(last)); }
    else if (event.key.toLowerCase() === "g") openJump();
    else if (event.key.toLowerCase() === "f") toggleFullscreen();
    else if (event.key.toLowerCase() === "r") resetLesson();
    else if (event.key.toLowerCase() === "m") openMap();
    else if (event.key.toLowerCase() === "s") drawer.classList.contains("open") ? closeSources() : openSources();
    else if (event.key.toLowerCase() === "p" && currentLesson) {
      progress.classList.toggle("is-hidden");
      showToast(progress.classList.contains("is-hidden") ? "Прогресс скрыт" : "Прогресс включён");
    }
    else if (event.key.toLowerCase() === "c" && isPresenter()) toggleControls();
  });

  jumpForm.addEventListener("submit", submitJump);
  window.addEventListener("popstate", route);
  window.addEventListener("mousemove", controlsActivity, { passive: true });
  window.addEventListener("focus", controlsActivity);

  fetch(withBase("/data/presentation.json"), { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`presentation.json: HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      validatePayload(payload);
      data = payload;
      route();
      controlsActivity();
      if (new URLSearchParams(location.search).get("selftest") === "1") runSelfTest();
    })
    .catch((error) => {
      stage.innerHTML = `<section class="home"><div class="home-inner"><span class="micro">Ошибка запуска</span><h1>Презентация не загрузилась</h1><p class="lead">${escapeHtml(error.message)}</p><p>Запусти сайт через <code>python3 server.py</code>, а не как file://.</p></div></section>`;
      console.error(error);
    });
})();
