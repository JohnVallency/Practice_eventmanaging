<#
.SYNOPSIS
    Полный сброс docker-окружения EventLMS до рабочего состояния.

.DESCRIPTION
    Последовательность шагов:
      1. docker compose down -v      - остановить стек и удалить тома (полная очистка данных).
      2. docker compose up -d --build - пересобрать образы и запустить сервисы.
      3. Ждать healthy-статуса всех сервисов (postgres, backend, frontend),
         опрашивая docker inspect --format "{{.State.Health.Status}}",
         с таймаутом 180 секунд (настраивается параметром -TimeoutSeconds).
      4. docker compose exec backend alembic upgrade head - применить миграции.
    При успехе печатает READY.

.PARAMETER TimeoutSeconds
    Общий бюджет ожидания healthy-статусов всех сервисов, сек (по умолчанию 180).

.EXAMPLE
    .\docker-reset.ps1
    .\docker-reset.ps1 -TimeoutSeconds 240
#>

param(
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

# Сервисы docker compose-проекта EventLMS, ожидаемые в healthy-статусе.
$services = @("postgres", "backend", "frontend")

<#
.SYNOPSIS
    Возвращает health-статус контейнера указанного compose-сервиса.
#>
function Get-ServiceHealth {
    param(
        [string]$ServiceName
    )

    # docker compose ps -q печатает идентификаторы контейнеров сервиса.
    $containerIds = docker compose ps -q $ServiceName 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$containerIds")) {
        return "no-container"
    }

    # Берём первый контейнер сервиса (наш стек однопроцессный, их ровно один).
    $firstId = ("$containerIds" -split "\r?\n" | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
    $status = docker inspect --format "{{.State.Health.Status}}" $firstId 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$status")) {
        return "inspect-failed"
    }
    return $status.Trim()
}

# --- Шаг 1: остановка и удаление томов -------------------------------------
Write-Host "[1/4] docker compose down -v (остановка стека и удаление томов)..."
docker compose down -v
if ($LASTEXITCODE -ne 0) {
    throw "docker compose down -v завершился с ошибкой (код $LASTEXITCODE)."
}

# --- Шаг 2: пересборка и запуск --------------------------------------------
Write-Host "[2/4] docker compose up -d --build (пересборка образов и запуск)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    throw "docker compose up -d --build завершился с ошибкой (код $LASTEXITCODE)."
}

# --- Шаг 3: ожидание healthy всех сервисов ---------------------------------
Write-Host ("[3/4] Ожидание healthy у {0} (таймаут {1} сек)..." -f ($services -join ", "), $TimeoutSeconds)
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$pending  = @($services)

while ($pending.Count -gt 0) {
    foreach ($svc in @($pending)) {
        $health = Get-ServiceHealth -ServiceName $svc
        if ($health -eq "healthy") {
            Write-Host ("  {0}: healthy" -f $svc)
        }
        else {
            # Сервис ещё поднимается (starting), перезапускается (restarting) или упал.
            Write-Host ("  {0}: {1}" -f $svc, $health)
        }
    }

    # Убираем достигшие healthy сервисы из списка ожидания.
    $pending = @($pending | Where-Object { (Get-ServiceHealth -ServiceName $_) -ne "healthy" })
    if ($pending.Count -eq 0) {
        break
    }

    if ((Get-Date) -gt $deadline) {
        throw ("Таймаут {0} сек: не достигли healthy: {1}" -f $TimeoutSeconds, ($pending -join ", "))
    }
    Start-Sleep -Seconds 5
}

# --- Шаг 4: применение миграций БД ------------------------------------------
Write-Host "[4/4] alembic upgrade head (миграции базы данных)..."
# -T отключает TTY: скрипт должен работать и без интерактивной консоли.
docker compose exec -T backend alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    throw "alembic upgrade head завершился с ошибкой (код $LASTEXITCODE)."
}

Write-Host "READY" -ForegroundColor Green
