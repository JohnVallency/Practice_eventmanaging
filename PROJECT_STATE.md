# PROJECT_STATE

| Дата | Этап | Готово | В работе | Следующее | Решения | Блокеры |
|------|------|--------|----------|-----------|---------|---------|
| 2026-09-14 | Ядро CPM ч.2 готово | Backward Pass (FS/SS/FF/SF, LF=project_duration у задач без последователей), TF/FF floats, identify_critical_path; POST /schedule/calculate теперь 4 шага: bulk-обновление ES/EF/LS/LF/TF/FF/is_critical одним UPDATE, ответ + critical_path (топопорядок) + project_duration; 69 тестов (35 unit ядра + 5 живых schedule-API + 29 прежних); формы ч.1 (Kahn, Forward) без изменений | — | RCPSP Serial SGS + приоритет-правила; REST-покрытие ядра в TaskResponse GET /api/tasks подтверждено | + floats: FF без учёта lag (упрощение ТЗ), TF может быть отрицателен при коротком горизонте; identify_critical_path принимает вложенный и плоский словарь; критический путь = TF==0; ядро ч.2 дописано капитаном после 2 исчерпаний контекста субагентов | — |
