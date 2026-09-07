(() => {
  "use strict";

  window.__presentationErrors = [];
  window.addEventListener("error", (event) => window.__presentationErrors.push(event.message || "window error"));
  window.addEventListener("unhandledrejection", (event) => window.__presentationErrors.push(String(event.reason || "unhandled rejection")));

  const app = document.getElementById("app");
  const stage = document.getElementById("stage");
  const ROOT_BASE = window.__BASE__ || (() => {
    let seg = location.pathname.replace(/[^/]*$/, "");
    const idx = seg.indexOf("/presentation/");
    if (idx >= 0) seg = seg.slice(0, idx + "/presentation/".length);
    return seg;
  })();
  const withBase = (p) => ROOT_BASE.replace(/\/$/, "") + p;

  const drawer = document.getElementById("source-drawer");
  const sourceList = document.getElementById("source-list");
  const presenterBar = document.querySelector(".presenter-bar");

  let data;
  let currentLesson = null;
  let drawerSources = [];
  let sourceReturnFocus = null;

  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
  const isPresenter = () => new URLSearchParams(location.search).get("present") === "1";
  const findLesson = (number) => data.lessons.find((lesson) => lesson.number === Number(number));

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
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
    if (ids.size !== 36) throw new Error(`Ожидалось 36 блоков, найдено ${ids.size}`);
    if (!payload.matrix || !Array.isArray(payload.matrix.products)) throw new Error("Нет матрицы харнессов");
  }

  function setShellMode() {
    ensureChrome();
    const presenter = isPresenter();
    app.classList.toggle("presentation-shell", presenter);
    if (presenterBar) presenterBar.hidden = !presenter;
    if (!presenter) app.classList.remove("controls-idle", "controls-hidden");
  }

  function updateNavigation() {
    document.querySelectorAll(".lesson-nav a").forEach((link) => {
      const href = link.getAttribute("href");
      const active = currentLesson && (href === `/lesson/${currentLesson.number}` || href === `./lesson/${currentLesson.number}` || decodeURIComponent(new URL(href, location.origin).pathname).endsWith(`/lesson/${currentLesson.number}`));
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  // ---------- component renderers (visuals, reveal-independent) ----------
  function revealClass(index) { return ""; }

  function renderHero(content) {
    if (content.variant === "route") {
      const nodes = content.items.map((item) => `
        <div class="route-node"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.text)}</small></div>`);
      const arrows = content.arrows || [];
      const flow = nodes.map((n, i) => i < nodes.length - 1
        ? n + `<div class="route-arrow" aria-hidden="true"><span class="route-arrow-line"></span><span class="route-arrow-head"></span>${arrows[i] ? `<em>${escapeHtml(arrows[i])}</em>` : ""}</div>`
        : n).join("");
      return `<div class="route-flow">${flow}</div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
    }
    if (content.variant === "split") {
      return `<div class="split-flow">
        <div class="route-node split-env"><b>${escapeHtml(content.items[0].title)}</b><small>${escapeHtml(content.items[0].text)}</small></div>
        <div class="split-link" aria-hidden="true"><em>подключается</em><span class="route-arrow-line"></span></div>
        <div class="split-core">одна модель</div>
        <div class="split-link" aria-hidden="true"><span class="route-arrow-line"></span><em>подключается</em></div>
        <div class="route-node split-env"><b>${escapeHtml(content.items[1].title)}</b><small>${escapeHtml(content.items[1].text)}</small></div>
      </div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
    }
    return `<div class="hero"><span class="hero-kicker">${escapeHtml(content.kicker)}</span><h2>${escapeHtml(content.headline)}</h2><p>${escapeHtml(content.subline)}</p></div><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderLayerDiagram(content) {
    const bands = content.steps.map((step) => `
      <div class="layer-band">
        <div class="layer-band-head"><b>${escapeHtml(step.title)}</b><em>${escapeHtml(step.cost || "")}</em></div>
        <span>${escapeHtml(step.text)}</span>
      </div>`).join("");
    return `<div class="layers-diagram"><div class="layers-spine" aria-hidden="true"><span>слои системы</span></div><div class="layers-bands">${bands}</div></div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderCards(content) {
    return `<div class="card-grid">${content.cards.map((card) => `
      <article class="info-card ${card.tone || ""}"><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.text)}</p></article>`).join("")}</div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderMatrix(content) {
    const columns = content.columns.map((c) => typeof c === "string" ? c : c.title);
    return `<div class="criteria-table-wrap"><table class="criteria-table"><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
      <tbody>${content.rows.map((row) => `<tr>${row.map((cell, i) => `<td${i === 0 ? ' class="row-head"' : ""}>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderWorkflow(content) {
    return `<ol class="workflow">${content.steps.map((step) => `<li><b>${escapeHtml(step.title)}</b><span>${escapeHtml(step.text)}</span></li>`).join("")}</ol>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderAcceptance(content) {
    const items = content.checks || content.items || [];
    return `<div class="accept-panel">${items.map((item) => {
      if (typeof item === "string") return `<label class="check"><input type="checkbox" tabindex="-1">${escapeHtml(item)}</label>`;
      const tone = item.tone === "pass" ? "pass" : item.tone === "open" ? "open" : "";
      return `<div class="check acceptance-row ${tone}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span><em>${escapeHtml(item.status || "")}</em></div>`;
    }).join("")}</div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderChecklist(content) {
    return `<ol class="checklist">${content.items.map((item) => `<li><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span></div></li>`).join("")}</ol>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderDecision(content) {
    const options = content.options || content.items || [];
    const formula = content.formula ? `<div class="decision-formula">${content.formula.map((f) => `<span>${escapeHtml(f)}</span>`).join("<i>→</i>")}</div>` : "";
    return `<div class="decision">${formula}${options.map((o) => `<div class="decision-row"><b>${escapeHtml(o.title)}</b><span>${escapeHtml(o.text)}</span></div>`).join("")}</div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderStats(content) {
    const items = content.stats || content.items || [];
    return `<div class="stats">${items.map((item) => `<div class="stat"><b>${escapeHtml(item.value)}</b><span>${escapeHtml(item.label)}</span></div>`).join("")}</div>
      ${content.limitation ? `<span class="qualitative">${escapeHtml(content.limitation)}</span>` : ""}
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderRing(content) {
    return `<div class="hub-diagram">
      <div class="hub-core">${escapeHtml(content.core)}</div>
      <div class="hub-spokes">${content.items.map((item) => `
        <div class="hub-spoke"><span class="hub-line" aria-hidden="true"></span><div class="ring-item"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.text)}</small></div></div>`).join("")}</div>
    </div>
      <p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderMatrixBlock(content) {
    return `<p class="matrix-hint"><strong>${escapeHtml(content.title)}</strong> — ${escapeHtml(content.text)}</p>${renderFullMatrix(content.state)}`;
  }

  function renderPersonalStack(content) {
    return `<div class="ring"><div class="ring-core">${escapeHtml(content.core)}</div><div class="ring-items">${content.cards.map((card) => `
      <div class="ring-item"><b>${escapeHtml(card.title)}</b><br><small>${escapeHtml(card.text)}</small></div>`).join("")}</div></div>
      <span class="qualitative">Личный/авторский контур, не универсальная рекомендация</span><p class="visual-caption">${escapeHtml(content.caption)}</p>`;
  }

  function renderFullMatrix(state) {
    const m = data.matrix;
    const maxLesson = state === "L1" ? 1 : state === "L2" ? 2 : state === "L3" ? 3 : 4;
    const rows = m.products.filter((p) => p.lesson <= maxLesson).map((p) => {
      return `<tr>
        <td class="row-head">${p.logo ? `<img class="product-logo" src="${escapeHtml((ROOT_BASE + p.logo.replace(/^\.\//, "")))}" alt="" width="28" height="28" loading="lazy">` : ""}${escapeHtml(p.name)}<br><small>${escapeHtml(p.role)}</small></td>
        <td>${escapeHtml(p.autonomy)}</td>
        <td>${"★".repeat(p.customization)}<span class="sr-only"> ${p.customization} из 6</span></td>
        <td>${escapeHtml(p.sourceStatus)}</td>
        <td>${escapeHtml(p.modelFreedom)}</td>
        <td>${escapeHtml(p.selfModifying)}</td>
        <td>${escapeHtml(p.interfaces.join(", "))}</td></tr>`;
    }).join("");
    return `<div class="criteria-table-wrap matrix-full"><table class="criteria-table matrix">
      <thead><tr><th>Продукт</th><th>Автономность</th><th>Кастомизация</th><th>Код</th><th>Модели</th><th>Самоизменение</th><th>Интерфейсы</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      `;
  }

  const renderers = {
    Hero: renderHero,
    LayerDiagram: renderLayerDiagram,
    ParallelCards: renderCards,
    CriteriaMatrix: renderMatrix,
    Workflow: renderWorkflow,
    AcceptancePanel: renderAcceptance,
    SourceProof: renderCards,
    RiskCard: renderCards,
    ActionChecklist: renderChecklist,
    DecisionTitle: renderDecision,
    Stats: renderStats,
    Ring: renderRing,
    MatrixBlock: renderMatrixBlock,
    PersonalStack: renderPersonalStack,
  };

  function renderVisual(screen) {
    const renderer = renderers[screen.component];
    if (!renderer) throw new Error(`Неизвестный component: ${screen.component}`);
    return renderer(screen.content);
  }

  // ---------- long grid rendering ----------
  function blockHtml(screen) {
    const notes = isPresenter() && screen.presenterNotes ? `
      <aside class="inline-notes"><b>Реплика:</b> ${escapeHtml(screen.presenterNotes.cue)} <b>· Дальше:</b> ${escapeHtml(screen.presenterNotes.next)} <b>· Риск:</b> ${escapeHtml(screen.presenterNotes.risk)}</aside>` : "";
    return `<section class="screen block" id="${escapeHtml(screen.id)}" aria-labelledby="t-${escapeHtml(screen.id)}">
      <div class="screen-inner">
        <div class="screen-head"><div><span class="micro">${escapeHtml(screen.micro)}</span><h2 id="t-${escapeHtml(screen.id)}">${escapeHtml(screen.title)}</h2><p class="lead">${escapeHtml(screen.lead)}</p></div></div>
        <div class="visual" data-component="${escapeHtml(screen.component)}">${renderVisual(screen)}</div>
        ${notes}
      </div>
    </section>`;
  }

  function renderLessonGrid(lesson) {
    currentLesson = lesson;
    document.title = `Урок ${lesson.number} · ${lesson.title}`;
    const blocks = lesson.screens.map((screen) => blockHtml(screen)).join("");
    const prevL = lesson.number > 1 ? `<a class="lesson-switch" href="${withBase("/lesson/" + (lesson.number - 1))}" data-route>← Урок ${lesson.number - 1}</a>` : `<span class="lesson-switch muted">← Урок ${lesson.number - 1}</span>`;
    const nextL = lesson.number < 4 ? `<a class="lesson-switch" href="${withBase("/lesson/" + (lesson.number + 1))}" data-route>Урок ${lesson.number + 1} →</a>` : `<span class="lesson-switch muted">Урок ${lesson.number + 1} →</span>`;
    const lessonNav = `<nav class="page-nav" aria-label="Навигация модуля">
      <a class="lesson-switch" href="${withBase("/")}" data-route>Все уроки</a>
      ${prevL}${nextL}
      <a class="lesson-switch" href="${withBase("/matrix")}" data-route>Матрица</a>
    </nav>`;
    stage.innerHTML = `<section class="long-grid" data-lesson="${lesson.number}">
      <header class="lesson-header"><nav class="page-nav top" aria-label="Навигация модуля"><a class="lesson-switch" href="${withBase("/")}" data-route>← Все уроки</a><a class="lesson-switch" href="${withBase("/matrix")}" data-route>Матрица</a></nav><span class="micro">Урок ${lesson.number} · ${escapeHtml(lesson.duration || "")}</span><h1>${escapeHtml(lesson.title)}</h1><p class="lead">${escapeHtml(lesson.outcome)}</p></header>
      ${blocks}
      <footer class="grid-footer">${lessonNav}</footer>
    </section>`;
    renderSourcesForLesson(lesson);
    updateNavigation();
    setShellMode();
  }

  function renderSourcesForLesson(lesson) {
    drawerSources = [...new Set(lesson.screens.flatMap((s) => s.sources))];
    renderDrawerSources();
  }

  function renderDrawerSources() {
    const list = drawerSources.map((id) => [id, data.sources[id]]).filter(([, s]) => s);
    sourceList.innerHTML = list.length ? list.map(([id, source]) => `<article class="drawer-source"><h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.claim)}</p><a href="${escapeHtml(source.url)}" ${source.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(id)} · открыть источник</a></article>`).join("") : "<p>На этой странице нет источников.</p>";
  }

  // DS: progress bar + dot navigation
  function ensureChrome() {
    if (!document.querySelector(".progress-bar")) {
      const bar = document.createElement("div");
      bar.className = "progress-bar";
      document.body.appendChild(bar);
      window.addEventListener("scroll", () => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
      }, { passive: true });
    }
  }

  function renderHome() {
    currentLesson = null;
    document.title = "AI-харнессы · презентация модуля";
    stage.innerHTML = `<section class="home"><div class="home-inner"><span class="micro">Дополнительный модуль · 4 урока</span>
      <h1>Выбирать, переносить и развивать <em>AI-харнессы</em></h1><p class="lead">${escapeHtml(data.promise)}</p>
      <div class="lesson-list">${data.lessons.map((lesson) => `<a class="lesson-link" href="${withBase("/lesson/" + lesson.number)}" data-route><span class="lesson-no">0${lesson.number}</span><div><h2>${escapeHtml(lesson.title)}</h2><p>${escapeHtml(lesson.outcome)}</p></div><div class="lesson-meta"><span>${lesson.screens.length} блоков</span><span>${escapeHtml(lesson.duration || "")}</span></div></a>`).join("")}</div>
      <a class="lesson-link matrix-link" href="${withBase("/matrix")}" data-route><span class="lesson-no">★</span><div><h2>Матрица харнессов</h2><p>Все 13 продуктов: автономность, кастомизация, код, модели, самоизменение</p></div><div class="lesson-meta"><span>13 строк</span><span>полная</span></div></a>
      <nav class="page-nav"><a class="lesson-switch" href="${withBase("/sources")}" data-route>Источники</a><a class="lesson-switch" href="${withBase("/matrix")}" data-route>Матрица</a></nav>
      <p class="footer-note">Каждый урок — один длинный grid: веди запись сверху вниз, ничего не листай по слайдам.</p></div></section>`;
    drawerSources = [];
    renderDrawerSources();
    updateNavigation();
    setShellMode();
  }

  function renderMatrixPage() {
    currentLesson = null;
    document.title = "Матрица харнессов · AI-харнессы";
    stage.innerHTML = `<section class="home matrix-page"><div class="home-inner"><nav class="page-nav top"><a class="lesson-switch" href="${withBase("/")}" data-route>← Все уроки</a></nav><span class="micro">Матрица · 13 продуктов · раскрывается по мере уроков</span><h1>Матрица <em>харнессов</em></h1><p class="lead">${escapeHtml(data.matrix.provenanceNote)}</p></div></section>
      <section class="screen block"><div class="screen-inner"><div class="visual">${renderFullMatrix("ALL")}</div></div></section>`;
    drawerSources = ["AUTHOR-MODEL"];
    renderDrawerSources();
    updateNavigation();
    setShellMode();
  }


  function renderSourcesPage() {
    currentLesson = null;
    document.title = "Источники · AI-харнессы";
    const rows = Object.entries(data.sources).map(([id, source]) => `<article class="source-row" id="${escapeHtml(id)}"><code>${escapeHtml(id)}</code><div><h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.claim)}</p><a href="${escapeHtml(source.url)}" ${source.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>Открыть источник</a></div></article>`).join("");
    stage.innerHTML = `<section class="sources-page"><span class="micro">Provenance · актуальность</span><h1>Факт, авторская модель и личный опыт разделены</h1><p class="lead">Product claims ведут к первичным источникам. Авторские классификации и локальные demo contracts не маскируются под отраслевой стандарт.</p><div class="source-register">${rows}</div></section>`;
    drawerSources = [];
    renderDrawerSources();
    updateNavigation();
    setShellMode();
  }

  function openSources() {
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

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      showToast("Fullscreen недоступен в этом браузере");
    }
  }

  function handleAction(action) {
    const actions = {
      sources: openSources, "sources-close": closeSources, fullscreen: toggleFullscreen,
      top: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    };
    actions[action]?.();
  }

  function navigateRoute(href) {
    const url = new URL(href, location.origin);
    if (!url.pathname.startsWith(ROOT_BASE) && ROOT_BASE !== "/") url.pathname = ROOT_BASE.replace(/\/$/, "") + url.pathname;
    history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    route();
  }

  function route() {
    closeSources();
    const rawPath = location.pathname.startsWith(ROOT_BASE) ? location.pathname.slice(ROOT_BASE.length) : location.pathname;
    const norm = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
    const path = norm.replace(/\/$/, "") || "/";
    if (path === "/") {
      const params = new URLSearchParams(location.search);
      const lessonParam = Number(params.get("lesson"));
      if (lessonParam >= 1 && lessonParam <= 4) { renderLessonGrid(findLesson(lessonParam)); return; }
      if (params.has("matrix")) { renderMatrixPage(); return; }
      if (params.has("sources")) { renderSourcesPage(); return; }
      renderHome();
    }
    else if (path === "/sources") renderSourcesPage();
    else if (path === "/matrix") renderMatrixPage();
    else {
      const match = path.match(/^\/lesson\/([1-4])$/);
      if (match) renderLessonGrid(findLesson(Number(match[1])));
      else renderNotFound();
    }
  }

  function renderNotFound() {
    currentLesson = null;
    stage.innerHTML = `<section class="home"><div class="home-inner"><span class="micro">404</span><h1>Такой страницы нет</h1><p class="lead">Вернись к индексу модуля.</p><a class="primary-action" href="${withBase("/")}" data-route>На главную</a></div></section>`;
    drawerSources = [];
    renderDrawerSources();
    updateNavigation();
    setShellMode();
  }

  async function runSelfTest() {
    const failures = [];
    const checks = [];
    const check = (condition, label) => {
      checks.push(label);
      if (!condition) failures.push(label);
    };
    const noOverflow = (label) => check(document.documentElement.scrollWidth <= window.innerWidth + 1, `${label}: no horizontal overflow`);

    const expectRows = { 1: 1, 2: 6, 3: 10, 4: 13 };
    for (const lesson of data.lessons) {
      renderLessonGrid(lesson);
      check(stage.querySelectorAll(`.long-grid[data-lesson="${lesson.number}"] .block`).length === lesson.screens.length, `lesson ${lesson.number}: ${lesson.screens.length} blocks`);
      check(stage.querySelectorAll(`.long-grid[data-lesson="${lesson.number}"] .screen-head h2`).length === lesson.screens.length, `lesson ${lesson.number}: all headings`);
      const matrixRows = stage.querySelectorAll(`.long-grid[data-lesson="${lesson.number}"] .criteria-table.matrix tbody tr`).length;
      check(matrixRows === expectRows[lesson.number], `lesson ${lesson.number}: matrix shows only studied rows (${expectRows[lesson.number]})`);
      noOverflow(`lesson ${lesson.number} grid`);
    }
    renderMatrixPage();
    check(stage.querySelectorAll(".criteria-table.matrix tbody tr").length === 13, "matrix page: 13 product rows");
    check(stage.querySelectorAll(".matrix .product-logo").length === 12, "matrix page: 12 logos (VelsClaude runs without an icon per DS)");
    await Promise.all(Array.from(stage.querySelectorAll(".matrix .product-logo")).map((img) => img.complete ? null : new Promise((res) => { img.onload = img.onerror = res; })));
    const logosOk = Array.from(stage.querySelectorAll(".matrix .product-logo")).every((img) => img.complete && img.naturalWidth > 4);
    check(logosOk, "matrix page: all logos load");
    renderHome();
    check(Boolean(stage.querySelector(".home")), "route / renders module index");
    renderSourcesPage();
    check(stage.querySelectorAll(".source-row").length === Object.keys(data.sources).length, "route /sources renders source register");

    check(window.__presentationErrors.length === 0, "no captured runtime errors");
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
    if (event.key === "Escape") { closeSources(); return; }
    if (event.key.toLowerCase() === "f") toggleFullscreen();
    else if (event.key.toLowerCase() === "s") drawer.classList.contains("open") ? closeSources() : openSources();
    else if (event.key.toLowerCase() === "t") window.scrollTo({ top: 0, behavior: "smooth" });
    else if (event.key.toLowerCase() === "c" && isPresenter()) {
      const hidden = app.classList.toggle("controls-hidden");
      showToast(hidden ? "Controls скрыты" : "Controls включены");
    }
  });

  window.addEventListener("popstate", route);

  fetch(withBase("/data/presentation.json"), { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`presentation.json: HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      validatePayload(payload);
      data = payload;
      route();
      if (new URLSearchParams(location.search).get("selftest") === "1") runSelfTest();
    })
    .catch((error) => {
      stage.innerHTML = `<section class="home"><div class="home-inner"><span class="micro">Ошибка запуска</span><h1>Презентация не загрузилась</h1><p class="lead">${escapeHtml(error.message)}</p><p>Запусти сайт через <code>python3 server.py</code>, а не как file://.</p></div></section>`;
      console.error(error);
    });
})();
