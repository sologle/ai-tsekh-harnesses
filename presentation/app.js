(() => {
  "use strict";
  const stage = document.getElementById("stage");
  const status = document.getElementById("route-status");
  const BASE = window.__BASE__;
  const fields = [
    ["autonomy", "Автономность"], ["customization", "Кастомизация"],
    ["sourceStatus", "Код"], ["modelFreedom", "Модели"],
    ["selfModifying", "Самоизменение"], ["interfaces", "Интерфейсы"],
  ];
  let data;
  let observer;
  window.__presentationErrors = [];
  window.addEventListener("error", e => window.__presentationErrors.push(e.message));
  window.addEventListener("unhandledrejection", e => window.__presentationErrors.push(String(e.reason)));
  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const value = v => Array.isArray(v) ? v.join(", ") : v;
  const url = path => BASE + path.replace(/^\//, "");
  const routeUrl = path => {
    const u = new URL(url(path), location.origin);
    if (new URLSearchParams(location.search).get("present") === "1") u.searchParams.set("present", "1");
    return u.pathname + u.search + u.hash;
  };
  const link = (path, label) => `<a href="${esc(routeUrl(path))}" data-route>${esc(label)}</a>`;
  const caption = c => c.caption ? `<p class="visual-caption">${esc(c.caption)}</p>` : "";
  const arrow = (text = "→") => `<span class="route-arrow" aria-hidden="true"><span class="horizontal">${text}</span></span>`;
  const node = item => `<div class="route-node"><b>${esc(item.title)}</b><small>${esc(item.text)}</small></div>`;
  const logo = p => p.logo ? `<img class="product-logo" src="${esc(url(p.logo))}" alt="" width="22" height="22" loading="lazy">` : "";
  const nav = () => `<nav class="page-nav" aria-label="Навигация модуля">${link("/", "Все уроки")}${link("/matrix", "Матрица")}${link("/sources", "Источники")}</nav>`;

  function validatePayload(d) {
    if (d?.schemaVersion !== 2 || d.lessons?.length !== 4 || d.matrix?.products?.length !== 13) throw new Error("Неполные данные модуля");
    const ids = new Set();
    for (const l of d.lessons) {
      if (l.screens.filter(s => s.component === "MatrixBlock").length !== 1) throw new Error("Матрица отсутствует в уроке");
      for (const s of l.screens) {
        if (ids.has(s.id) || !s.sceneRefs?.length || !s.sources?.length || s.sources.some(id => !d.sources[id]) || !renderers[s.component]) throw new Error(`Нарушен контракт блока ${s.id}`);
        ids.add(s.id);
      }
    }
    for (const p of d.matrix.products) {
      if (fields.some(([key]) => !value(p[key]) || typeof value(p[key]) !== "string") || !p.scope || !p.note) throw new Error(`Неполный паспорт ${p.id}`);
    }
  }

  function renderHero(c) {
    if (c.variant === "split") return `<div class="split-flow">${node(c.items[0])}${arrow("←")}<div class="split-core">Одна модель</div>${arrow()}${node(c.items[1])}</div>${caption(c)}`;
    return `<div class="route-flow">${c.items.map(node).join(arrow())}<p class="route-label">${esc(c.sequence)}</p></div>${caption(c)}`;
  }
  function renderLayers(c) {
    return `<div class="layers-bands">${c.steps.map(s => `<div class="layer-band"><div class="layer-band-head"><b>${esc(s.title)}</b><em>${esc(s.cost)}</em></div><span>${esc(s.text)}</span></div>`).join("")}</div>${caption(c)}`;
  }
  function renderCards(c) {
    return `<div class="card-grid">${c.cards.map(x => `<article class="info-card"><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join("")}</div>${caption(c)}`;
  }
  function renderComparison(c) {
    const table = `<div class="comparison-desktop"><table class="criteria-table"><caption>${esc(c.caption)}</caption><thead><tr>${c.columns.map(x => `<th scope="col">${esc(x)}</th>`).join("")}</tr></thead><tbody>${c.rows.map(row => `<tr><th scope="row">${esc(row[0])}</th>${row.slice(1).map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return table + `<div class="comparison-mobile">${c.rows.map(row => `<article class="product-card"><h3>${esc(row[0])}</h3><dl>${row.slice(1).map((x, i) => `<div class="property"><dt>${esc(c.columns[i + 1])}</dt><dd>${esc(x)}</dd></div>`).join("")}</dl></article>`).join("")}${caption(c)}</div>`;
  }
  function renderWorkflow(c) {
    return `<ol class="workflow">${c.steps.map(s => `<li><b>${esc(s.title)}</b><span>${esc(s.text)}</span></li>`).join("")}</ol>${(c.branches || []).map(b => `<p class="flow-branch">${esc(b)}</p>`).join("")}${caption(c)}`;
  }
  function renderChecklist(c) {
    return `<ul class="checklist">${c.items.map(x => `<li><b>${esc(x.title)}</b><span>${esc(x.text)}</span></li>`).join("")}</ul>${caption(c)}`;
  }
  function renderAcceptance(c) {
    return `<div class="accept-panel">${c.checks.map(x => `<div class="acceptance-row"><b>${esc(x.title)}</b><span>${esc(x.text)}</span><em>${esc(x.status)}</em></div>`).join("")}</div>${caption(c)}`;
  }
  function renderDecision(c) {
    return `<div class="decision">${c.formula ? `<div class="decision-formula">${c.formula.map(x => `<span>${esc(x)}</span>`).join(`<i>${esc(c.connector || "≠")}</i>`)}</div>` : ""}${c.items.map(x => `<div class="decision-row"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join("")}</div>${caption(c)}`;
  }
  function renderArchitecture(c) {
    return `<div class="architecture"><div class="shell-boundary"><b>${esc(c.shell.title)}</b><p>${esc(c.shell.text)}</p></div><div class="side-port"><b>${esc(c.input.title)}</b><p>${esc(c.input.text)}</p><p>Задача → харнесс<br>Наблюдение ← харнесс<br>Подтверждение → действие</p></div><div class="harness-boundary"><b>${esc(c.core)}</b><div class="diagram-node">${esc(c.model)}</div><ol class="loop">${c.loop.map(x => `<li>${esc(x)}</li>`).join("")}</ol><p class="loop-return">↶ ${esc(c.return)}</p></div></div>${caption(c)}`;
  }
  function renderShared(c) {
    return `<div class="shared-core"><div class="shared-inputs">${c.cards.map(x => `<div class="diagram-node"><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div>`).join("")}</div><p class="route-label">${esc(c.connection)}</p><div class="core"><b>${esc(c.core)}</b><p>${esc(c.knowledge)}</p></div></div>${caption(c)}`;
  }
  function renderDocument(c) {
    return `<div class="document-fields"><b>${esc(c.name)}</b><p>${esc(c.state)}</p><dl>${c.fields.map(f => `<dt>${esc(f.title)}</dt><dd>${esc(f.text)}</dd>`).join("")}</dl></div>${caption(c)}`;
  }
  function renderControl(c) {
    return `<div class="control-plane"><div class="control-lane"><b>Исполнение</b><p>${esc(c.request)}</p></div><div class="control-lane"><b>Контроль до действия</b><div class="control-gate">${esc(c.gate)}</div></div><div class="control-lane"><b>Разрешено ↓</b><p>${esc(c.action)}</p></div><div class="control-lane"><b>Проверка после</b><p>${esc(c.result)}</p></div><p class="flow-branch">${esc(c.denied)}</p></div>${caption(c)}`;
  }
  function renderTree(c) {
    const branch = nodes => `<ul>${nodes.map(n => `<li><div class="tree-row">${n.example ? `<a id="file-${esc(n.id)}" href="#example-${esc(n.id)}" data-anchor>${esc(n.name)}</a>` : `<b>${esc(n.name)}</b>`}<span class="purpose">${esc(n.purpose)}</span></div>${n.children ? branch(n.children) : ""}</li>`).join("")}</ul>`;
    const flatten = nodes => nodes.flatMap(n => [n, ...flatten(n.children || [])]);
    return `<div class="tree">${branch(c.nodes)}</div><div class="tree-examples">${flatten(c.nodes).filter(n => n.example).map(n => `<section id="example-${esc(n.id)}" tabindex="-1"><h3>${esc(n.name)}</h3><p>${esc(n.example)}</p><a href="#file-${esc(n.id)}" data-anchor>К файлу в дереве</a></section>`).join("")}</div>${caption(c)}`;
  }
  function renderFullMatrix(prefix, focus = "") {
    const products = data.matrix.products;
    const rows = products.map(p => `<tr data-product="${esc(p.id)}"${p.id === focus ? ' class="focus-product"' : ""}><th scope="row"><div class="product-head">${logo(p)}<div><b>${esc(p.name)}</b><small>${esc(p.scope)}</small></div></div></th>${fields.map(([k]) => `<td data-field="${k}">${esc(value(p[k]))}</td>`).join("")}</tr>`).join("");
    const table = `<div class="matrix-desktop"><table class="criteria-table matrix"><caption>Полное сравнение: 13 продуктов, шесть независимых свойств</caption><thead><tr><th scope="col">Продукт и компонент</th>${fields.map(([, title]) => `<th scope="col">${esc(title)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const cards = `<div class="matrix-mobile"><nav class="product-jump" aria-label="Продукты в матрице">${products.map(p => `<a href="#${prefix}-${p.id}" data-anchor>${esc(p.name)}</a>`).join("")}</nav>${products.map(p => `<article class="product-card" id="${prefix}-${p.id}" tabindex="-1" data-product="${p.id}"><header>${logo(p)}<div><h3>${esc(p.name)}</h3><p>${esc(p.scope)}</p></div></header><dl>${fields.map(([k, title]) => `<div class="property"><dt>${esc(title)}</dt><dd data-field="${k}">${esc(value(p[k]))}</dd></div>`).join("")}</dl><p class="product-note">${esc(p.note)}</p>${link(`/sources#product-${p.id}`, "Основания и границы")}</article>`).join("")}</div>`;
    const notes = `<div class="matrix-notes"><p>«Не подтверждено» обозначает пробел проверки, а не невозможность функции. Открытый компонент не делает открытыми модель и внешний сервис.</p><details><summary>Пояснения к продуктам</summary><ul>${products.map(p => `<li><b>${esc(p.name)}.</b> ${esc(p.note)} ${link(`/sources#product-${p.id}`, "Источники")}</li>`).join("")}</ul></details></div>`;
    return table + cards + notes;
  }
  const renderers = {
    Hero: renderHero, LayerDiagram: renderLayers, ParallelCards: renderCards,
    CriteriaMatrix: renderComparison, Workflow: renderWorkflow, AcceptancePanel: renderAcceptance,
    ActionChecklist: renderChecklist, DecisionTitle: renderDecision, Architecture: renderArchitecture,
    SharedCore: renderShared, Document: renderDocument, ControlPlane: renderControl, ProjectTree: renderTree,
    MatrixBlock: (c, id) => `<p class="matrix-hint">${esc(c.text)}</p>${renderFullMatrix(id, c.focus)}`,
  };
  function block(s) {
    return `<section class="screen block${s.component === "MatrixBlock" ? " matrix-block" : ""}" id="${s.id}" aria-labelledby="t-${s.id}"><div class="screen-inner"><div class="screen-head"><span class="micro">${esc(s.micro)}</span><h2 id="t-${s.id}">${esc(s.title)}</h2><p class="lead">${esc(s.lead)}</p></div><div class="visual" data-component="${s.component}">${renderers[s.component](s.content, s.id)}</div>${s.paragraphs?.length ? `<div class="explanation">${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}</div>` : ""}<div class="source-links">${s.sources.map(id => link(`/sources#${id}`, data.sources[id].title)).join("")}</div></div></section>`;
  }
  function renderLesson(l) {
    document.title = `Урок ${l.number} · ${l.title}`;
    stage.innerHTML = `<article class="long-grid" data-lesson="${l.number}"><header class="lesson-header">${nav()}<span class="micro">Урок ${l.number}</span><h1 tabindex="-1">${esc(l.title)}</h1><p class="lead">${esc(l.outcome)}</p></header>${l.screens.map(block).join("")}<footer class="grid-footer"><p>${esc(l.assignment)}</p><nav class="page-nav" aria-label="Следующий шаг">${l.number > 1 ? link(`/lesson/${l.number - 1}`, "Предыдущий урок") : ""}${l.number < 4 ? link(`/lesson/${l.number + 1}`, "Следующий урок") : ""}${link("/", "Все уроки")}</nav></footer></article>`;
  }
  function renderHome() {
    document.title = data.title;
    stage.innerHTML = `<section class="home-inner"><span class="micro">AI.Цех · дополнительный модуль</span><h1 tabindex="-1">Выбираем, переносим и развиваем AI-харнессы</h1><p class="lead">${esc(data.promise)}</p><div class="lesson-list">${data.lessons.map(l => `<a class="lesson-link" href="${esc(routeUrl(`/lesson/${l.number}`))}" data-route><span class="lesson-no">Урок ${l.number}</span><h2>${esc(l.title)}</h2><p>${esc(l.outcome)}</p></a>`).join("")}</div><div class="matrix-link"><h2>${link("/matrix", "Матрица харнессов")}</h2><p>Все 13 продуктов: автономность, кастомизация, код, модели, самоизменение и интерфейсы.</p></div>${nav()}<p class="footer-note">Уроки читаются последовательно; матрица доступна и на отдельной странице.</p></section>`;
  }
  function renderMatrixPage() {
    document.title = "Матрица харнессов · AI.Цех";
    stage.innerHTML = `<article class="matrix-page"><header class="page-intro">${nav()}<span class="micro">Полное сравнение</span><h1 tabindex="-1">Матрица харнессов</h1><p class="lead">Сравниваем режим работы, способы изменения, код, модели, самоизменение и интерфейсы. Ограничения конфигурации указаны рядом со значениями.</p></header><section class="screen matrix-block"><div class="screen-inner">${renderFullMatrix("matrix")}</div></section></article>`;
  }
  function sourceHref(source) {
    if (/^https:\/\//.test(source.url || "")) return source.url;
    return source.url ? url(source.url) : "";
  }
  function renderSourcesPage() {
    document.title = "Источники и основания · AI.Цех";
    const sources = Object.entries(data.sources).map(([id, s]) => `<section class="source-row" id="${id}" tabindex="-1"><h2>${esc(s.title)}</h2><p>${esc(s.claim)}</p>${sourceHref(s) ? `<a href="${esc(sourceHref(s))}">${s.kind === "specification" ? "Открыть учебный контракт" : "Открыть первичный источник"}</a>` : `<p>${esc(s.explanation)}</p>`}</section>`).join("");
    const facts = data.matrix.products.map(p => `<section class="source-row" id="product-${p.id}" tabindex="-1"><h2>${esc(p.name)}: основания свойств</h2><p>${esc(p.scope)}. ${esc(p.note)}</p><dl>${fields.map(([key, title]) => { const f = p.facts[key]; return `<dt>${esc(title)}</dt><dd>${esc(value(p[key]))}. ${esc(f.scope)} ${f.sourceIds.map(id => link(`/sources#${id}`, data.sources[id].title)).join(" · ")}</dd>`; }).join("")}</dl></section>`).join("");
    stage.innerHTML = `<article class="sources-page">${nav()}<span class="micro">Источники и основания</span><h1 tabindex="-1">Разделяем факты, объяснения и требования к демонстрациям</h1><p class="lead">Сведения о продуктах связываем с первичными источниками. Учебные схемы и личный опыт не заменяют воспроизводимый запуск.</p>${sources}${facts}${nav()}</article>`;
  }
  function normalizeLegacyRoute() {
    const u = new URL(location.href);
    const lesson = u.searchParams.get("lesson");
    const view = u.searchParams.get("view");
    let path = /^[1-4]$/.test(lesson || "") ? `lesson/${lesson}` : u.searchParams.has("matrix") || view === "matrix" ? "matrix" : u.searchParams.has("sources") || view === "sources" ? "sources" : "";
    if (!path) return;
    for (const key of ["lesson", "matrix", "sources", "view"]) u.searchParams.delete(key);
    u.pathname = url(path);
    history.replaceState(history.state, "", u);
  }
  function chrome() {
    observer?.disconnect();
    document.querySelector(".dot-nav")?.remove();
    stage.querySelectorAll("a").forEach((a, i) => { if (!a.id) a.id = `nav-${i}`; });
    const blocks = [...stage.querySelectorAll(".block")];
    if (blocks.length) {
      const dots = document.createElement("nav");
      dots.className = "dot-nav";
      dots.setAttribute("aria-label", "Разделы урока");
      dots.innerHTML = blocks.map(b => `<a href="#${b.id}" data-anchor aria-label="${esc(b.querySelector("h2").textContent)}"></a>`).join("");
      document.body.append(dots);
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          dots.querySelectorAll("a").forEach(a => a.removeAttribute("aria-current"));
          dots.querySelector(`[href="#${entry.target.id}"]`)?.setAttribute("aria-current", "location");
        }
      }, {rootMargin: "-10% 0px -65% 0px"});
      blocks.forEach(b => observer.observe(b));
    }
    progress();
  }
  function progress() {
    const h = document.documentElement;
    document.querySelector(".progress-bar").style.width = `${h.scrollHeight > innerHeight ? scrollY / (h.scrollHeight - innerHeight) * 100 : 0}%`;
  }
  function setRecording() {
    document.body.classList.toggle("recording", new URLSearchParams(location.search).get("present") === "1" && matchMedia("(min-width: 1280px)").matches);
  }
  function renderRoute() {
    normalizeLegacyRoute();
    setRecording();
    const path = location.pathname.slice(BASE.length).replace(/\/$/, "");
    const lesson = path.match(/^lesson\/([1-4])$/);
    if (lesson) renderLesson(data.lessons.find(l => l.number === Number(lesson[1])));
    else if (path === "matrix") renderMatrixPage();
    else if (path === "sources") renderSourcesPage();
    else if (!path || path === "index.html") renderHome();
    else { document.title = "Страница не найдена"; stage.innerHTML = `<section class="home-inner"><h1 tabindex="-1">Такой страницы нет</h1><p>Можно вернуться к списку уроков.</p>${nav()}</section>`; }
    chrome();
    document.body.dataset.ready = "true";
  }
  function remember() {
    const openDetails = [...stage.querySelectorAll("details")].map((d, i) => d.open ? i : -1).filter(i => i >= 0);
    history.replaceState({...history.state, scroll: scrollY, focus: document.activeElement?.id, openDetails}, "");
  }
  function focusTarget(target, smooth = false) {
    if (!target) return;
    if (!target.matches("a, button, input, summary, [tabindex]")) target.tabIndex = -1;
    target.focus({preventScroll: true});
    const behavior = smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant";
    target.scrollIntoView({behavior, block: "start"});
  }
  function restore(pop = false) {
    if (pop && history.state?.scroll !== undefined) {
      stage.querySelectorAll("details").forEach((d, i) => { d.open = history.state.openDetails?.includes(i) || false; });
      document.getElementById(history.state.focus)?.focus({preventScroll: true});
      window.scrollTo({top: history.state.scroll, behavior: "instant"});
    } else if (location.hash) {
      focusTarget(document.getElementById(decodeURIComponent(location.hash.slice(1))));
    } else {
      stage.querySelector("h1")?.focus({preventScroll: true});
      window.scrollTo({top: 0, behavior: "instant"});
    }
  }
  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[data-route], a[data-anchor]");
    if (!a || a.target || a.download) return;
    const u = new URL(a.href);
    if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
    e.preventDefault();
    remember();
    history.pushState({}, "", u);
    if (a.hasAttribute("data-anchor")) focusTarget(document.getElementById(decodeURIComponent(u.hash.slice(1))), true);
    else { renderRoute(); restore(); status.textContent = document.title; }
  });
  history.scrollRestoration = "manual";
  window.addEventListener("popstate", () => { renderRoute(); restore(true); status.textContent = document.title; });
  window.addEventListener("scroll", progress, {passive: true});
  window.addEventListener("resize", setRecording);

  async function runSelfTest() {
    const failures = [];
    let checks = 0;
    const check = (ok, text) => { checks++; if (!ok) failures.push(text); };
    for (const l of data.lessons) {
      renderLesson(l);
      check(stage.querySelectorAll(".block").length === l.screens.length, `lesson ${l.number}: blocks`);
      check(stage.querySelectorAll(".matrix tbody tr").length === 13, `lesson ${l.number}: table`);
      check(stage.querySelectorAll(".matrix-mobile .product-card").length === 13, `lesson ${l.number}: cards`);
      check(stage.querySelectorAll(".matrix-mobile dt").length === 78, `lesson ${l.number}: semantic fields`);
      check(!stage.innerText.includes("★"), `lesson ${l.number}: no ratings`);
      check(document.documentElement.scrollWidth <= innerWidth + 1, `lesson ${l.number}: overflow`);
    }
    renderMatrixPage();
    check(stage.querySelectorAll(".matrix [scope=row]").length === 13, "matrix row headers");
    check(stage.querySelectorAll(".matrix caption").length === 1, "matrix caption");
    renderSourcesPage();
    check(stage.querySelectorAll(".source-row").length === Object.keys(data.sources).length + 13, "sources and facts");
    check(![...stage.querySelectorAll("a")].some(a => a.pathname === "/sources" && BASE !== "/"), "base-aware sources");
    await document.fonts.ready;
    check(document.fonts.check('16px "Igra Sans"'), "font loaded");
    check(window.__presentationErrors.length === 0, "runtime errors");
    renderRoute();
    restore();
    const result = document.createElement("pre");
    result.id = "selftest-results";
    result.hidden = true;
    result.textContent = JSON.stringify({status: failures.length ? "fail" : "pass", checks, failures, runtimeErrors: window.__presentationErrors});
    document.getElementById(result.id)?.remove();
    document.body.append(result);
    document.body.dataset.selftest = failures.length ? "fail" : "pass";
  }
  const cacheBuster = new URLSearchParams(location.search).get("cb");
  fetch(url("data/presentation.json") + (cacheBuster ? `?cb=${encodeURIComponent(cacheBuster)}` : ""), {cache: "no-store"})
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(async d => {
      validatePayload(d); data = d; renderRoute(); await document.fonts.ready; restore();
      if (new URLSearchParams(location.search).get("selftest") === "1") await runSelfTest();
    })
    .catch(error => {
      stage.innerHTML = `<section class="home-inner"><h1 tabindex="-1">Не удалось загрузить данные</h1><p>Можно повторить загрузку или вернуться к списку уроков.</p><a href="${esc(location.href)}">Повторить загрузку</a> · ${link("/", "Все уроки")}</section>`;
      status.textContent = "Ошибка загрузки";
      console.error(error);
    });
})();