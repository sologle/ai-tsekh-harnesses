# Verification report · presentation site

Статус: **PASS**. Структурная и браузерная проверка выполнены 2026-09-06 в Playwright Chromium 151.

## Scope

- 4 урока, 34 устойчивых screen ID.
- Routes `/`, `/lesson/1` … `/lesson/4`, `/sources`.
- Deep link `#P1-01`, presenter mode `?present=1`, reveal state в `?reveal=N`.
- Keyboard navigation, fullscreen, jump, reset, map launch, source drawer, persistence.
- Safe zone PiP 28% × 32% снизу слева в presenter mode.
- Детерминированный локальный SVG/PNG export текущего reveal.
- Без CDN, внешних шрифтов и runtime API.

## Automated verification

Команда:

```bash
python3 verify.py
```

Дополнительный полный прогон:

```bash
python3 browser_verify.py
```

Он запускает локальный server, выполняет встроенные browser assertions на desktop/mobile и создаёт:

- `artifacts/desktop-1920x1080.png`;
- `artifacts/mobile-390x844.png`;
- `artifacts/browser-verification.json`.

Проверка реально выполнена через `playwright_verify.py` в Playwright Chromium 151. На четырёх viewport (1920×1080, 1440×900, 760×900 и 390×844) прошли по 117 встроенных browser assertions; failures и runtime console/page errors отсутствуют. Созданы проверочные PNG и `artifacts/browser-verification.json`. После визуальной проверки мобильная панель управления была упрощена: export-кнопки скрыты на узком экране, основная навигация помещается без горизонтальной обрезки.

## Browser matrix

| Check | 1920×1080 | 1440×900 | 760px | 390×844 |
|---|---|---|---|---|
| Route rendering | PASS | PASS | PASS | PASS |
| No page horizontal scroll | PASS | PASS | PASS | PASS |
| PiP safe zone | PASS | PASS | N/A | N/A |
| Keyboard-only navigation | PASS | PASS | PASS | PASS |
| Drawer/dialog focus | PASS | PASS | PASS | PASS |
| Console errors | 0 | 0 | 0 | 0 |
| Screenshot | PASS | optional | optional | PASS |

## Manual keyboard route

1. Open `/lesson/1?present=1#P1-01`.
2. Use Space through all reveals and ArrowRight into P1-02.
3. Use ArrowUp to reverse one reveal, PageDown to continue, Home/End to jump.
4. Press `g`, enter `P1-06`, verify URL and restored screen after refresh.
5. Press `s`, inspect source links, Escape, press `m`, verify `/map?state=L1-start`.
6. Press `r`, verify P1-01 reveal 0; press `f` twice.
7. Repeat one deep link per lesson and `/sources`.

## Anti-slop audit

Implemented:

- no gradients, glow fields, floating decorative blobs, fake dashboards or invented metrics;
- no stock “AI brain” art, robot imagery or decorative charts;
- one decision per screen and no more than three equal-priority visual groups;
- orange/green/amber/blue have semantic roles only;
- product claims carry source IDs and freshness;
- Ouroboros figures are labelled self-reported aggregate and limitation appears with figures;
- qualitative diagrams visibly say they are not measurements;
- personal experience and author model are distinct from verified facts;
- no important controls in PiP safe zone.

## Missing external assets

These are production inputs outside this presentation implementation and are not fabricated here:

1. Licensed `Igra Sans` webfont files, if the course license permits bundling. Current fallback is Inter/Arial/system sans.
2. Separate interactive map implementation for `/map?state=...`; the presentation links to the contract route and does not duplicate it.
3. Dated product UI/source captures and full fallback recordings listed in `production/lesson-*/assets-and-demo.md`.
4. VelsClaude Full dated capture supplied by the author; public Light must not substitute it.
5. Sanitized Codex/OpenCode/Pi/bb/Hermes demo recordings and deterministic project artifacts.

The presentation itself uses no missing images: all concept screens are rendered from local text/CSS and can export their current state to SVG/PNG.
