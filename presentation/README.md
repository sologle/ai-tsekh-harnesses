# Presentation site · AI-харнессы

Самостоятельный static-first сайт для записи четырёх уроков. Внешних runtime-зависимостей нет.

## Запуск

```bash
cd /opt/data/profiles/course-curator/workspace/ai-harnesses-module/implementation/presentation
python3 server.py --host 127.0.0.1 --port 4173
```

Открыть:

- viewer: `http://127.0.0.1:4173/`
- presenter: `http://127.0.0.1:4173/lesson/1?present=1#P1-01`
- sources: `http://127.0.0.1:4173/sources`

Для прямых routes нужен `server.py` или любой web server с fallback на `index.html` для `/lesson/*` и `/sources`.

## Клавиши

- `→`, `PageDown`, `Space`: следующий reveal / экран
- `←`, `↑`, `PageUp`: предыдущий reveal / экран
- `Home`, `End`: начало / конец текущего урока
- `g`: переход по номеру или ID
- `f`: fullscreen
- `r`: reset текущего урока
- `m`: отдельная карта в подходящем состоянии
- `s`: источники текущего экрана
- `p`: скрыть/вернуть прогресс
- `c`: скрыть/вернуть presenter controls
- `Esc`: закрыть drawer/dialog

URL хранит screen ID в hash и reveal в query (`?present=1&reveal=2#P2-04`). Последнее положение также сохраняется локально отдельно для каждого урока.

## Экспорт fallback-состояний

В presenter bar кнопки SVG и PNG экспортируют текущий экран при текущем reveal в фиксированном кадре 1920×1080. Файл называется по схеме `P2-04-r2.svg/png`. Экспорт выполняется локально, без CDN и сети.

## Проверка

```bash
python3 verify.py
python3 browser_verify.py
```

Первая команда валидирует JSON, 34 обязательных P-ID, уникальность, scene refs, источники, fallback assets, titles, routes, внешние URL и отсутствие CDN. Вторая находит установленный Chromium, сама поднимает сервер, прогоняет все 34 финальных reveal-состояния в 1920×1080 и 390×844, проверяет клавиатуру/deep link/reset/drawer/runtime errors/overflow и сохраняет PNG плюс JSON-отчёт в `artifacts/`.
