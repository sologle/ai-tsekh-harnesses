import { STATES, filteredProducts } from "./state.js";
export const labels = {
  sourceStatus: {
    open: "○ открытый",
    closed: "■ закрытый",
    "mixed/unknown": "? не установлен",
  },
  modelFreedom: {
    integrated: "единый стек",
    "multi-provider": "выбор моделей",
    "config-dependent": "модели: по конфигурации",
  },
  depth: { demo: "ДЕМО", overview: "ОБЗОР", "control-point": "ОПОРНАЯ ТОЧКА" },
  deployments: {
    local: "локально",
    cloud: "облако",
    "persistent-server": "постоянный сервер",
  },
  autonomy: {
    direct: "прямое управление",
    bounded: "ограниченная задача",
    delegated: "делегированная задача",
    persistent: "постоянная работа",
    "self-change": "самоизменение",
  },
  selfModifying: {
    no: "нет в рассматриваемой конфигурации",
    "claimed/reviewed": "заявлено / reviewed",
    unknown: "не установлено",
  },
  customization: {
    1: "настройки",
    2: "инструкции / skills",
    3: "extensions / plugins",
    4: "собственные tools / UI",
    5: "оболочка над харнессом",
    6: "контролируемое самоизменение",
  },
  provenance: {
    "official-product-statement": "Заявление продукта",
    "course-material": "Материалы курса",
    "author-placement": "Авторское размещение",
    "personal-experience": "Личный опыт автора",
  },
};
export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const text = (x, y, s, size = 16, fill = "#F5F5F7", extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
export function wrap(s, length) {
  const lines = [];
  for (const w of s.split(/\s+/)) {
    if (!lines.length || `${lines.at(-1)} ${w}`.length > length) lines.push(w);
    else lines[lines.length - 1] += " " + w;
  }
  return lines;
}
function multiline(
  x,
  y,
  s,
  length = 40,
  size = 16,
  fill = "#A0A0A8",
  leading = 21,
) {
  return wrap(s, length)
    .map((l, i) => text(x, y + i * leading, l, size, fill))
    .join("");
}
export const CARD = { w: 242, h: 146 };
// Display offsets are not semantic placements. Every card retains an anchor + leader.
const homes = {
  "claude-code": [386, 562],
  codex: [280, 373],
  opencode: [645, 562],
  zcode: [548, 348],
  "kimi-code": [126, 562],
  kilo: [907, 516],
  pi: [907, 687],
  bb: [984, 340],
  "velsclaude-full": [1243, 403],
  ouroboros: [1030, 168],
  hermes: [1455, 168],
  openclaw: [1565, 355],
  nanoclaw: [1490, 559],
};
export const anchor = (p) => ({ x: 140 + p.x * 1670, y: 720 - p.y * 555 });
export const unanchor = (x, y) => ({
  x: Math.max(0, Math.min(1, (x - 140) / 1670)),
  y: Math.max(0, Math.min(1, (720 - y) / 555)),
});
export function layout(data, state) {
  const used = [],
    result = [];
  // Layout against all 13, even if hidden or filtered: no filter-induced movement.
  for (const p of data.products) {
    const at = anchor(state.placementsOverride[p.id] || p.placement);
    const home = state.placementsOverride[p.id]
      ? [at.x - CARD.w / 2, at.y - CARD.h / 2]
      : homes[p.id];
    const valid = ([x, y]) =>
      x >= 110 &&
      x + CARD.w <= 1830 &&
      y >= 160 &&
      y + CARD.h <= 839 &&
      !(x < 540 && y + CARD.h > 728) &&
      !used.some(
        (q) =>
          x < q.x + CARD.w + 12 &&
          x + CARD.w + 12 > q.x &&
          y < q.y + CARD.h + 12 &&
          y + CARD.h + 12 > q.y,
      );
    let chosen = home;
    if (!valid(chosen)) {
      const choices = [];
      for (let y = 162; y <= 692; y += 20)
        for (let x = 112; x <= 1588; x += 20)
          if (valid([x, y])) choices.push([x, y]);
      choices.sort(
        (a, b) =>
          Math.hypot(a[0] - home[0], a[1] - home[1]) -
          Math.hypot(b[0] - home[0], b[1] - home[1]),
      );
      if (choices.length) chosen = choices[0];
    }
    const item = { id: p.id, x: chosen[0], y: chosen[1], anchor: at };
    used.push(item);
    result.push(item);
  }
  return result;
}
export const scenarios = {
  code: {
    name: "Исправить код",
    explanation:
      "Инженерная задача + ограниченные права + тест + review. Подсветка показывает область вопроса, не список рекомендаций.",
    ids: [
      "claude-code",
      "codex",
      "opencode",
      "zcode",
      "kimi-code",
      "kilo",
      "pi",
    ],
  },
  briefing: {
    name: "Ежедневная сводка",
    explanation:
      "Постоянный процесс + расписание + журнал + бюджет + остановка. Наличие Telegram само по себе ничего не доказывает.",
    ids: ["hermes", "openclaw", "nanoclaw"],
  },
  shell: {
    name: "Своя оболочка",
    explanation:
      "Управление агентами + интерфейс + доступы + поддержка. У bb и VelsClaude Full разные задачи; самоизменение не подразумевается.",
    ids: ["bb", "velsclaude-full"],
  },
};
function svgCard(p, at, selected, scenario, interactive) {
  const chosen = selected === p.id,
    highlight = scenario && scenarios[scenario].ids.includes(p.id);
  const border = chosen
    ? "#FF6B35"
    : highlight
      ? "#7AA2FF"
      : p.depth === "demo"
        ? "#767683"
        : p.depth === "control-point"
          ? "#7AA2FF"
          : "#464650";
  const monogram = {
    "claude-code": "CC",
    codex: "CX",
    opencode: "OC",
    zcode: "Z",
    "kimi-code": "K",
    kilo: "Ki",
    pi: "π",
    bb: "bb",
    "velsclaude-full": "VC",
    ouroboros: "O",
    hermes: "H",
    openclaw: "Cl",
    nanoclaw: "NC",
  }[p.id];
  const { x, y } = at,
    nearestX = Math.max(x, Math.min(x + CARD.w, at.anchor.x)),
    nearestY = Math.max(y, Math.min(y + CARD.h, at.anchor.y));
  const role = wrap(p.role, 27);
  return {
    leader: `<g aria-hidden="true"><path d="M${at.anchor.x},${at.anchor.y} L${nearestX},${nearestY}" stroke="${border}" fill="none"/><circle cx="${at.anchor.x}" cy="${at.anchor.y}" r="3.5" fill="${border}"/></g>`,
    card: `<g class="product" data-product="${p.id}" ${interactive ? `role="button" tabindex="0" aria-label="${esc(p.name)}: ${esc(p.role)}. ${labels.depth[p.depth]}. Открыть детали" aria-haspopup="dialog"` : ""}>
 <title>${esc(p.name + " · " + p.placement.rationale)}</title>
 <rect class="card-body" x="${x}" y="${y}" width="242" height="146" rx="12" fill="${chosen ? "#27221F" : "#1C1C22"}" stroke="${border}" stroke-width="${chosen ? 2 : 1}"/>
 <rect x="${x + 13}" y="${y + 13}" width="34" height="34" rx="7" fill="#2C2C34"/>
 ${text(x + 30, y + 37, monogram, 17, "#F5F5F7", 'text-anchor="middle" font-weight="700"')}
 ${text(x + 57, y + 32, p.name, p.name.length > 13 ? 20 : 24, "#F5F5F7", 'font-weight="700"')}
 ${text(x + 57, y + 48, labels.depth[p.depth], 10, p.depth === "demo" ? "#F5F5F7" : "#A0A0A8", 'letter-spacing="1.1"')}
 ${role.map((l, i) => text(x + 13, y + 69 + i * 18, l, 14)).join("")}
 ${text(x + 13, y + 106, labels.sourceStatus[p.sourceStatus], 12, "#A0A0A8")}
 ${text(x + 13, y + 122, labels.modelFreedom[p.modelFreedom], 12, "#A0A0A8")}
 ${text(x + 224, y + 111, "△", 18, "#FFB454", 'text-anchor="end"')}
 ${text(x + 13, y + 138, p.interfaces.join(" · ") || "Интерфейсы: неизвестно", 11, "#A0A0A8")}
 </g>`,
  };
}
export function mapSVG(
  data,
  ring,
  state,
  {
    interactive = true,
    pip = true,
    roadmap = false,
    scenario = "",
    selected = null,
    zoom = 1,
    pan = { x: 0, y: 0 },
    width = 1920,
    height = 1080,
    exporting = false,
  } = {},
) {
  const i = STATES.indexOf(state.reveal),
    products = filteredProducts(data, state),
    positions = layout(data, state),
    expired = Date.now() > Date.parse(ring.expiresAt);
  const cards = products.map((p) =>
    svgCard(
      p,
      positions.find((a) => a.id === p.id),
      selected,
      scenario,
      interactive,
    ),
  );
  const elements =
    cards.map((c) => c.leader).join("") + cards.map((c) => c.card).join("");
  const xAxis =
    i >= 1
      ? `<g data-axis="x"><path d="M560 856 H1820 l-10 -5 m10 5 l-10 5" stroke="#A0A0A8" fill="none"/>${text(560, 884, "Код и инженерная работа", 18)}${text(1820, 884, "Личные, управленческие и внешние процессы", 18, "#F5F5F7", 'text-anchor="end"')}</g>`
      : "";
  const yAxis =
    i >= 2
      ? `<g data-axis="y"><path d="M84 675 V230 l-5 10 m5 -10 l5 10" stroke="#A0A0A8" fill="none"/>${text(124, 185, "ДЕЛЕГИРОВАННАЯ И ПОСТОЯННАЯ", 13, "#A0A0A8", 'letter-spacing="1.4"')}${text(124, 205, "АВТОНОМНАЯ РАБОТА", 13, "#A0A0A8", 'letter-spacing="1.4"')}${text(124, 724, "НЕПОСРЕДСТВЕННЫЙ КОНТРОЛЬ", 13, "#A0A0A8", 'letter-spacing="1.2"')}</g>`
      : "";
  const legend =
    state.legend || exporting
      ? `<g data-legend="true">${text(560, 937, "ЧИТАЙ МАРКЕРЫ, НЕ РЕЙТИНГ", 11, "#FF6B35", 'letter-spacing="2"')}${text(560, 962, "○ открытый   ■ закрытый   ? неизвестно", 14, "#A0A0A8")}${text(925, 962, "ДЕМО / ОБЗОР / ОПОРА: глубина урока", 14, "#A0A0A8")}${text(1340, 962, "△ конфигурация · детали по нажатию", 14, "#FFB454")}${text(560, 985, "В деталях: запуск · кастомизация · автономность · самоизменение · происхождение сведений", 13, "#A0A0A8")}</g>`
      : "";
  const external =
    i === 8
      ? `<g data-ring="true"><path d="M560 1000 H1830" stroke="#464650" stroke-dasharray="5 5"/>${text(560, 1024, "ВНЕШНИЙ КРУГ", 11, "#A0A0A8", 'letter-spacing="2"')}${ring.entries.map((p, index) => `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" ${interactive ? "" : 'tabindex="-1"'} aria-label="${esc(p.name)}: внешний источник, новая вкладка"><rect x="${770 + index * 162}" y="1007" width="145" height="30" rx="15" stroke="#464650" fill="#16161A"/>${text(786 + index * 162, 1028, p.name + " ↗", 14, "#A0A0A8")}</a>`).join("")}${text(1300, 1027, expired ? "△ Список устарел: обновить перед записью" : "Проверка названий: " + ring.checkedAt.slice(0, 10), 13, expired ? "#FFB454" : "#A0A0A8")}${text(560, 1057, ring.disclaimer, 13, "#A0A0A8")}</g>`
      : "";
  const roadmapShapes = roadmap
    ? `<g data-roadmap="true" fill="none" stroke="#767683" stroke-dasharray="8 8"><rect x="500" y="285" width="265" height="180" rx="14"/><rect x="960" y="175" width="310" height="190" rx="14"/><rect x="1450" y="200" width="300" height="320" rx="14"/></g>`
    : "";
  const task = scenario
    ? `<g data-scenario="${scenario}" stroke="#7AA2FF" fill="none">${positions
        .filter(
          (p) =>
            scenarios[scenario].ids.includes(p.id) &&
            products.some((v) => v.id === p.id),
        )
        .map(
          (p) =>
            `<path stroke-dasharray="5 7" d="M1330 150 Q1330 200 ${p.anchor.x} ${p.anchor.y}"/>`,
        )
        .join("")}</g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1920 1080" width="${width}" height="${height}" class="map-svg" role="group" aria-label="Качественная карта AI-харнессов, ${state.reveal}" style="font-family:Arial,sans-serif;background:#0F0F12">
 <title>AI.Цех · Карта харнессов · ${state.reveal}</title><desc>${esc(data.disclaimer)}</desc>
 <defs><clipPath id="plot-clip"><rect x="100" y="158" width="1735" height="683"/></clipPath></defs>
 <rect width="1920" height="1080" fill="#0F0F12"/>
 ${text(42, 35, "AI.ЦЕХ / ПОЛЕВОЙ АТЛАС", 11, "#FF6B35", 'letter-spacing="2.2" font-weight="700"')}
 ${text(40, 89, "Выбирай среду.", 48, "#F5F5F7", 'font-weight="700"')}${text(448, 89, "Не логотип.", 48, "#FF6B35", 'font-weight="700"')}
 ${text(42, 124, "AI-харнессы: от инженерной задачи до постоянной личной среды", 18, "#A0A0A8")}
 ${text(1878, 124, "Источники · " + data.checkedAt, 13, "#A0A0A8", 'text-anchor="end"')}
 <path d="M40 145 H1880" stroke="#2C2C34"/>
 <g clip-path="url(#plot-clip)"><g data-world="true" transform="translate(${pan.x} ${pan.y}) translate(960 500) scale(${zoom}) translate(-960 -500)">${task}${roadmapShapes}${elements}</g></g>
 ${xAxis}${yAxis}
 ${pip ? '<g data-pip="true" aria-hidden="true"><rect x="0" y="734" width="538" height="346" fill="#0F0F12"/><path d="M24 770 v-20 h20 M514 770 v-20 h-20 M24 1036 v20 h20 M514 1036 v20 h-20" stroke="#2C2C34" fill="none"/></g>' : ""}
 ${legend}
 <g data-disclaimer="true"><path d="M560 899 H1828" stroke="#2C2C34"/>${multiline(560, 915, data.disclaimer, 170, 13, "#A0A0A8", 17)}</g>
 ${external}
 ${i !== 8 ? text(560, 1040, "Авторская модель · проверка источников " + data.checkedAt + " · " + state.reveal, 14, "#A0A0A8") : ""}
 ${exporting ? text(42, 710, "Проверка источников: " + data.checkedAt, 13, "#A0A0A8") : ""}
 </svg>`;
}
export function mobileMarkup(data, ring, state) {
  const products = filteredProducts(data, state),
    i = STATES.indexOf(state.reveal);
  const summaries = [
    "Общий язык",
    "Coding и переносимость",
    "Кастомизация",
    "Постоянные личные среды",
  ];
  return `<p class="mobile-caveat">${esc(data.disclaimer)}</p><div class="mobile-axis">${i >= 1 ? "<p><b>X · Работа</b><br>Код и инженерная работа → личные, управленческие и внешние процессы</p>" : ""}${i >= 2 ? "<p><b>Y · Контроль</b><br>Непосредственный контроль → делегированная и постоянная автономная работа</p>" : ""}</div>${state.legend ? '<p class="mobile-legend">○ открытый · ■ закрытый · ? неизвестно<br>ДЕМО / ОБЗОР / ОПОРА: глубина разбора<br>△ свойства зависят от конфигурации</p>' : ""}${[
    1, 2, 3, 4,
  ]
    .map((n) => {
      const group = products.filter((p) => p.lesson === n);
      return group.length
        ? `<section class="lesson-group"><p class="micro">Урок ${n} / ${summaries[n - 1]}</p>${group.map((p) => `<button class="mobile-card" data-product="${p.id}" aria-haspopup="dialog"><span class="depth">${labels.depth[p.depth]}</span><strong>${esc(p.name)}</strong><span>${esc(p.role)}</span><span class="muted">${labels.sourceStatus[p.sourceStatus]} · ${labels.modelFreedom[p.modelFreedom]}</span><span class="muted">${p.interfaces.join(" / ") || "Интерфейсы: неизвестно"}</span><span class="warning">△ Уточни конфигурацию →</span></button>`).join("")}</section>`
        : "";
    })
    .join(
      "",
    )}${!products.length ? '<div class="mobile-empty" role="img" aria-label="Пустое поле карты"></div>' : ""}${i === 8 ? `<section class="mobile-ring"><p class="micro">Внешний круг</p><p>${ring.disclaimer}</p><div class="row">${ring.entries.map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.name)} ↗</a>`).join("")}</div><p class="muted">Проверка названий: ${ring.checkedAt.slice(0, 10)}</p></section>` : ""}`;
}
