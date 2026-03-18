# Деплой на сервер

## Ошибка "Unit mapapi.service not found"

Она появляется, пока на сервере не создан systemd-сервис. После настройки перезапуск из GitHub Actions будет работать.

## Настройка сервиса на сервере

1. Установи на сервере .NET 6 Runtime (если запускаешь без Docker):
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt install -y dotnet-runtime-6.0
   ```

2. Создай каталог для приложения и скопируй туда файлы (или используй SCP из GitHub Actions):
   ```bash
   sudo mkdir -p /var/www/mapapi
   ```

3. Скопируй unit-файл и включи сервис:
   ```bash
   sudo cp mapapi.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable mapapi
   sudo systemctl start mapapi
   ```

4. В `mapapi.service` поправь пути и строку подключения к БД (WorkingDirectory, ExecStart, ConnectionStrings__DefaultConnection), если у тебя другие значения.

Либо поднимай всё через Docker: в каталоге с `docker-compose.yml` выполни `docker-compose up -d` — тогда systemd не нужен, а шаг "Restart service" в Actions можно не использовать.
