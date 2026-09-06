export const STATES = [
  "L1-start",
  "L1-x",
  "L1-xy",
  "L1-legend",
  "L1-end",
  "L2-end",
  "L3-end",
  "L4-core",
  "Final",
];
export const FILTERS = {
  sourceStatus: ["", "open", "closed", "mixed/unknown"],
  modelFreedom: ["", "integrated", "multi-provider", "config-dependent"],
  depth: ["", "demo", "overview", "control-point"],
  customization: ["", "3", "4", "5", "6"],
  selfModifying: ["", "no", "claimed/reviewed", "unknown"],
  interfaces: ["", "CLI", "IDE", "desktop", "web", "messenger", "API"],
  deployments: ["", "local", "cloud", "persistent-server"],
  autonomy: ["", "direct", "bounded", "delegated", "persistent", "self-change"],
};
export const blankFilters = () =>
  Object.fromEntries(Object.keys(FILTERS).map((k) => [k, ""]));
export function canonical(data, reveal = 8) {
  const index = typeof reveal === "string" ? STATES.indexOf(reveal) : reveal;
  if (!Number.isInteger(index) || index < 0 || index > 8)
    throw Error("Неизвестное состояние карты");
  return {
    schemaVersion: 1,
    datasetVersion: data.datasetVersion,
    reveal: STATES[index],
    visibleIds: data.products.filter((p) => p.reveal <= index).map((p) => p.id),
    placementsOverride: {},
    legend: index >= 3,
    filters: blankFilters(),
  };
}
export function reduce(data, state, action) {
  switch (action.type) {
    case "preset":
      return canonical(data, action.reveal);
    case "next":
      return canonical(data, Math.min(8, STATES.indexOf(state.reveal) + 1));
    case "previous":
      return canonical(data, Math.max(0, STATES.indexOf(state.reveal) - 1));
    case "visibility":
      return {
        ...state,
        visibleIds: data.products
          .filter((p) =>
            p.id === action.id
              ? action.visible
              : state.visibleIds.includes(p.id),
          )
          .map((p) => p.id),
      };
    case "legend":
      return { ...state, legend: action.value };
    case "filter":
      if (
        !(action.key in FILTERS) ||
        !FILTERS[action.key].includes(action.value)
      )
        throw Error("Неизвестный фильтр");
      return {
        ...state,
        filters: { ...state.filters, [action.key]: action.value },
      };
    case "clearFilters":
      return { ...state, filters: blankFilters() };
    case "place": {
      if (!data.products.some((p) => p.id === action.id))
        throw Error("Неизвестная карточка");
      const { x, y } = action.placement;
      if (
        ![x, y].every(
          (v) =>
            typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
        )
      )
        throw Error("Размещение вне поля");
      return {
        ...state,
        placementsOverride: {
          ...state.placementsOverride,
          [action.id]: { x, y },
        },
      };
    }
    default:
      throw Error("Неизвестное действие");
  }
}
export function filteredProducts(data, state) {
  return data.products.filter(
    (p) =>
      state.visibleIds.includes(p.id) &&
      Object.entries(state.filters).every(
        ([key, value]) =>
          !value ||
          (key === "customization"
            ? p[key] >= Number(value)
            : Array.isArray(p[key])
              ? p[key].includes(value)
              : p[key] === value),
      ),
  );
}
export function stateExport(data, state) {
  return {
    ...state,
    placementIsQualitative: true,
    placementRationales: Object.fromEntries(
      data.products
        .filter((p) => state.visibleIds.includes(p.id))
        .map((p) => [p.id, p.placement.rationale]),
    ),
  };
}
export function validateImport(data, input) {
  let obj;
  try {
    obj =
      typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  } catch {
    throw Error("Некорректный JSON: файл не изменил карту");
  }
  const fail = (reason) => {
    throw Error(`Импорт отклонён: ${reason}`);
  };
  const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const walk = (v, level = 0) => {
    if (level > 12) fail("слишком глубокая структура");
    if (v && typeof v === "object")
      for (const k of Object.keys(v)) {
        if (["__proto__", "prototype", "constructor"].includes(k))
          fail("опасный ключ");
        walk(v[k], level + 1);
      }
  };
  walk(obj);
  if (!plain(obj)) fail("ожидается объект");
  const allowed = [
    "schemaVersion",
    "datasetVersion",
    "reveal",
    "visibleIds",
    "placementsOverride",
    "legend",
    "filters",
    "placementIsQualitative",
    "placementRationales",
  ];
  if (Object.keys(obj).some((k) => !allowed.includes(k)))
    fail("неизвестное поле");
  if (obj.schemaVersion !== 1) fail("неподдерживаемая schemaVersion");
  if (obj.datasetVersion !== data.datasetVersion)
    fail("другая datasetVersion; используйте актуальный набор");
  if (!STATES.includes(obj.reveal)) fail("неизвестный reveal");
  const ids = data.products.map((p) => p.id);
  if (
    !Array.isArray(obj.visibleIds) ||
    obj.visibleIds.some((id) => !ids.includes(id)) ||
    new Set(obj.visibleIds).size !== obj.visibleIds.length
  )
    fail("неизвестные или повторные product IDs");
  if (typeof obj.legend !== "boolean") fail("legend должен быть boolean");
  if (!plain(obj.placementsOverride)) fail("неверные placementsOverride");
  for (const [id, p] of Object.entries(obj.placementsOverride)) {
    if (
      !ids.includes(id) ||
      !plain(p) ||
      Object.keys(p).sort().join(",") !== "x,y" ||
      ![p.x, p.y].every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
      )
    )
      fail("неверное качественное placement");
  }
  if (
    !plain(obj.filters) ||
    Object.keys(obj.filters).sort().join(",") !==
      Object.keys(FILTERS).sort().join(",")
  )
    fail("неверная структура filters");
  for (const [key, value] of Object.entries(obj.filters))
    if (!FILTERS[key].includes(value)) fail("неизвестное значение filters");
  if ("placementIsQualitative" in obj && obj.placementIsQualitative !== true)
    fail("карта только качественная");
  if (
    "placementRationales" in obj &&
    (!plain(obj.placementRationales) ||
      Object.entries(obj.placementRationales).some(
        ([id, v]) => !ids.includes(id) || typeof v !== "string",
      ))
  )
    fail("неверные rationale");
  // Never merge untrusted objects into the canonical dataset. Imported rationales are ignored.
  return {
    schemaVersion: 1,
    datasetVersion: data.datasetVersion,
    reveal: obj.reveal,
    visibleIds: ids.filter((id) => obj.visibleIds.includes(id)),
    placementsOverride: Object.fromEntries(
      Object.entries(obj.placementsOverride).map(([id, p]) => [
        id,
        { x: p.x, y: p.y },
      ]),
    ),
    legend: obj.legend,
    filters: { ...obj.filters },
  };
}
