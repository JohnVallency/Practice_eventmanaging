<#
.SYNOPSIS
    Читает логи указанного сервиса docker compose-стека EventLMS.

.DESCRIPTION
    Обёртка над "docker compose logs" с удобными значениями по умолчанию.
    Работает на PowerShell 5.1+; комментарии и вывод на русском.

.PARAMETER Service
    Имя сервиса из docker compose-файла (postgres | backend | frontend).

.PARAMETER Tail
    Сколько последних строк показать (по умолчанию 50).

.PARAMETER Follow
    Ключ -Follow: продолжать потоково выводить новые строки логов
    (аналог docker logs -f). Прерывается Ctrl+C.

.EXAMPLE
    .\docker-logs.ps1                          # backend, последние 50 строк
    .\docker-logs.ps1 -Service postgres -Tail 200
    .\docker-logs.ps1 -Service backend -Follow
#>

param(
    [ValidateSet("postgres", "backend", "frontend")]
    [string]$Service = "backend",

    [ValidateRange(1, 100000)]
    [int]$Tail = 50,

    [switch]$Follow
)

$ErrorActionPreference = "Stop"

# Собираем аргументы docker compose logs в один массив.
$logArgs = @("compose", "logs", "--tail", $Tail, "--timestamps", $Service)
if ($Follow) {
    $logArgs += "--follow"
}

Write-Host ("Логи сервиса '{0}' (последние {1} строк):" -f $Service, $Tail)

# & вызывает docker с подготовленными аргументами; вывод идёт в консоль как есть.
& docker @logArgs

if ($LASTEXITCODE -ne 0) {
    throw ("docker compose logs завершился с ошибкой (код {0}) для сервиса '{1}'." -f $LASTEXITCODE, $Service)
}
