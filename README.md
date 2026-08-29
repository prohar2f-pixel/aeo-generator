# SEO + AI Visibility Generator

Статический генератор публикуется из ветки `main` через GitHub Pages. Целевой production endpoint анализа — `https://api.aiprohar.ru/v1/analyze`; после миграции Cloudflare Worker не является production deployment channel.

## Локальные тесты

Требуется Node.js 20 или новее:

```sh
npm test
```

Тесты покрывают Node HTTP-адаптер, rate limiter и SSRF-контракт общего ядра `worker/worker.js`.

## VPS backend

Сервис слушает только `127.0.0.1:8789`. Секрет хранится отдельно от приложения в `/etc/aeo-analyzer/environment`:

```text
OPENROUTER_API_KEY=replace_on_server_only
```

Файл должен принадлежать `root:root` и иметь mode `0600`. Значение нельзя передавать в командной строке, добавлять в репозиторий или выводить в журналы.

Исходящие запросы анализатора направляются через локальный HTTP-прокси Xray `127.0.0.1:10809`. Xray работает отдельным непривилегированным пользователем и не меняет default route VPS. URL подписки хранится только на сервере в `/etc/xray/subscription-url` с mode `0600`; сгенерированный конфиг — `/etc/xray/config.json` с владельцем `root:xray` и mode `0640`. В `/etc/aeo-analyzer/environment` дополнительно задаётся:

```text
ANALYZER_PROXY_URL=http://127.0.0.1:10809
```

`deploy/generate-xray-config.py` принимает только HTTPS-подписку ожидаемого провайдера, VLESS + REALITY + TCP на порту 443 и проверяет конфиг через `xray run -test` до атомарной замены. `deploy/xray.service` запускает Xray только после успешного обновления конфига.

Установка из checkout на VPS:

```sh
sudo ./deploy/install-vps.sh
```

Installer создаёт непривилегированного пользователя, версионированный release, systemd unit и Nginx-фрагменты. Он не перезаписывает существующий virtual host. После резервного копирования HTTPS-конфига `api.aiprohar.ru` добавьте внутрь соответствующего `server` block:

```nginx
include /etc/nginx/snippets/aeo-analyzer-location.conf;
```

Затем выполните `sudo nginx -t` и только при успешной проверке — `sudo systemctl reload nginx`.

## Проверка и обновление

Перед переключением frontend обязательны:

```sh
systemctl is-active aeo-analyzer.service
systemctl is-active xray.service
systemctl show aeo-analyzer.service -p NRestarts
ss -ltn | grep '127.0.0.1:10809'
curl -i -X OPTIONS -H 'Origin: https://aeo.aiprohar.ru' https://api.aiprohar.ru/v1/analyze
curl -i -X OPTIONS -H 'Origin: https://example.com' https://api.aiprohar.ru/v1/analyze
```

Также проверяются `file://`, localhost, private IPv4/IPv6, DNS в private IP, private redirect, тело больше 32 KiB и 429 на одиннадцатом запросе к одному hostname. Frontend переключается только после прохождения этих проверок.

## Откат

После переключения нельзя возвращаться на старый Cloudflare Worker: его SSRF-защита не подтверждена. Для отката backend укажите `/opt/aeo-analyzer/current` на предыдущий каталог в `/opt/aeo-analyzer/releases`, восстановите `/etc/systemd/system/aeo-analyzer.service` и `/etc/aeo-analyzer/environment` из последнего root-only backup, затем выполните `systemctl daemon-reload` и перезапустите `aeo-analyzer.service`. Если проблема относится только к Xray, остановите `xray.service`, восстановите backup analyzer environment/unit и предыдущий release. Существующие Nginx-конфиги перед изменением сохраняются рядом с исходным файлом с временной меткой.
