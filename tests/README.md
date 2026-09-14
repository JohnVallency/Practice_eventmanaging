# Тестирование EventLMS

## Backend — pytest

Расположение: `backend/tests/`.

Запуск:

```bash
cd backend
pip install -r requirements.txt
pytest
```

Покрытие по этапам MVP:

| Этап | Что проверяется | Инструменты |
|------|-----------------|-------------|
| Костяк | `GET /health` → 200, тело `{"status": "ok"}` | fastapi.testclient.TestClient |
| Ядро DAG | Топологическая сортировка Кана: корректный порядок, обнаружение цикла | pytest, чистый Python |
| CPM | Forward/Backward Pass: ES/EF/LS/LF, резервы, критический путь на эталонной сети | pytest |
| RCPSP | Serial Scheduling: допустимость расписания, соблюдение зависимостей и лимитов ресурсов | pytest |
| API | CRUD событий/задач, валидация схем Pydantic | TestClient + тестовая БД |

## Frontend — vitest (план)

Расположение: `frontend/src/**/*.test.ts(x)` (вводится на этапе UI-логики).

Планируемое покрытие:

- `services/api.ts` — мок `fetch`: успешный ответ, сетевая ошибка, не-200 ответ.
- `store/` — подписки `useSyncExternalStore`, переходы состояния.
- `components/` — рендер `StatusCard` с разными состояниями.

## Интеграционная проверка готовности

```bash
docker compose up --build
# ожидается:
# 1) все три сервиса в состоянии Up, postgres проходит healthcheck
# 2) curl http://localhost:8000/health → 200 {"status":"ok"}
# 3) http://localhost:5173 открывает страницу EventLMS
```
