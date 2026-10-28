# «По скидке»: skidka.store на Google Cloud через GitHub

Это отдельная версия приложения для Ubuntu/Debian с Node.js 24, Caddy и SQLite. В этой папке есть код сайта, PWA, парсер Magnum, импорт SMALL и свои аккаунты. Пакеты npm для запуска не нужны. Node.js нужен именно ветки 24.x.

Загрузи в корень своего GitHub-репозитория содержимое этой папки po-skidke-vps: в корне должны лежать server.mjs, package.json и папка deploy. Локальная папка magnum-astana предназначена для Sites и разработки; для своего сервера используй эту серверную версию. Пароли сервера, ключи, .env и базы в GitHub не загружай. При первом запуске создаётся пустая база. Существующие логины, избранное и фильтры потребуют отдельного переноса данных из действующей Cloudflare D1. Копирование кода само по себе их не переносит.

Схема подключения:

    Домен → DNS указывает IP → Caddy :443 (HTTPS) → Node.js 127.0.0.1:4173 → SQLite

Сайт будет работать на VPS независимо от размещения в Sites. В этой версии сохраняется собственный вход по логину и паролю; внешний экран входа ChatGPT к VPS не относится.

## 1. Что заменить

- Домен skidka.store уже указан в deploy/Caddyfile и deploy/app.env.example.
- `SERVER_IP` — публичный IPv4 из панели сервера.
- `SERVER_USER` — SSH-пользователь из панели сервера, часто `root` или `ubuntu`.

В конфигурации домен меняется в ДВУХ местах: `/etc/po-skidke.env` и `/etc/caddy/Caddyfile`. Адреса PWA приложение подставляет автоматически.

## 2. Домен: DNS

В Google Cloud открой Compute Engine → VM instances и скопируй External IP своей VM. В VPC network → IP addresses закрепи этот адрес: External IP addresses → меню адреса → Promote to static IP address → Reserve. Этот адрес должен остаться привязан к VM.

В Namecheap: Domain List → Manage возле skidka.store → Advanced DNS → Host Records. Если домен использует сторонние nameservers, записи меняются у соответствующего DNS-провайдера; для нового домена можно использовать Namecheap BasicDNS.

В панели, которая управляет DNS домена, создай или отредактируй:

| Тип | Имя | Значение |
|---|---|---|
| A | @ | SERVER_IP |
| CNAME | www | skidka.store |

`@` означает основной домен. Иногда вместо него панель предлагает пустое поле или само имя домена. В значение A нужен реальный публичный IP, а не текст SERVER_IP. В CNAME не ставят `https://`.

DNS может управляться у регистратора или у другого сервиса, на чьи NS уже делегирован домен. Менять записи надо именно там. Оставь остальные записи, если они используются. AAAA добавляют только при настроенном на сервере IPv6. Если домен уже имеет старую A-запись парковки, замени её для основного домена на свой IP.

Проверка в PowerShell на компьютере:

```powershell
nslookup skidka.store
nslookup www.skidka.store
```

Ожидаемый адрес — SERVER_IP. Обновление зависит от кешей и TTL: результат может появиться не сразу.

## 3. GitHub и вход на сервер

В Google Cloud → Compute Engine → VM instances нажми SSH возле своей VM. Откроется терминал сервера. Либо используй PowerShell на компьютере:

```powershell
ssh SERVER_USER@SERVER_IP
```

Если SSH использует другой порт, добавь `-p НОМЕР`. Для приватного репозитория далее используй свой штатный способ GitHub-аутентификации; не вставляй токен в URL репозитория.

Дальнейшие команды — ВНУТРИ SSH, на сервере. Для пользователя root слово `sudo` можно опускать. Команды рассчитаны на apt и systemd; версию ОС можно посмотреть через `cat /etc/os-release`.

## 4. Установить Node.js 24 и Caddy

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/po-skidke-node-setup.sh
sudo bash /tmp/po-skidke-node-setup.sh
sudo apt install -y nodejs
node --version
```

Ожидается `v24...`. Это репозиторий NodeSource; инструкция и поддерживаемые системы: https://github.com/nodesource/distributions/blob/master/DEV_README.md

Установи Caddy из его официального репозитория:

```bash
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /tmp/po-skidke-caddy.key
sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/po-skidke-caddy.key
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /tmp/po-skidke-caddy.list
sudo install -m 0644 /tmp/po-skidke-caddy.list /etc/apt/sources.list.d/caddy-stable.list
sudo chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo apt update
sudo apt install -y caddy
caddy version
```

Официальная инструкция Caddy: https://caddyserver.com/docs/install#debian-ubuntu-raspbian

## 5. Разложить файлы

Для нового пустого сервера:

```bash
git clone https://github.com/YOUR_LOGIN/YOUR_REPOSITORY.git ~/po-skidke-code
sudo mkdir -p /opt/po-skidke
sudo cp -a ~/po-skidke-code/. /opt/po-skidke/
cd /opt/po-skidke
sudo useradd --system --user-group --home-dir /var/lib/po-skidke --no-create-home --shell /usr/sbin/nologin po-skidke
sudo install -m 0600 deploy/app.env.example /etc/po-skidke.env
sudo nano /etc/po-skidke.env
```

Команда useradd нужна один раз. Если пользователь po-skidke уже создан, повторять её не требуется.

Содержимое `/etc/po-skidke.env`:

```ini
PUBLIC_ORIGIN=https://skidka.store
PORT=4173
DB_PATH=/var/lib/po-skidke/accounts.sqlite
```

Домен уже указан; менять его не нужно. `PUBLIC_ORIGIN` должен точно совпадать с адресом сайта после редиректа. Это необходимо для входа и защищённых cookie.

В nano: Ctrl+O, Enter — сохранить; Ctrl+X — выйти.

Назначение файлов:

| Файл или папка | Назначение |
|---|---|
| `/opt/po-skidke/server.mjs` | Сервер приложения |
| `/opt/po-skidke/ui.js`, `client.js` | Интерфейс и его поведение |
| `/opt/po-skidke/lib`, `worker`, `data` | Логика, API и резервные каталоги |
| `/etc/po-skidke.env` | Домен, порт и путь базы |
| `/etc/caddy/Caddyfile` | HTTPS и направление запросов в приложение |
| `/var/lib/po-skidke/accounts.sqlite` | Аккаунты, избранное, фильтры, импорт SMALL |

## 6. Настроить Caddy

Открой файл:

```bash
sudo nano /etc/caddy/Caddyfile
```

На пустом сервере замени его содержимое следующим, подставив СВОЙ домен во всех трёх местах:

```caddyfile
skidka.store {
    encode gzip
    reverse_proxy 127.0.0.1:4173 {
        header_up X-Real-IP {remote_host}
    }
}

www.skidka.store {
    redir https://skidka.store{uri} permanent
}
```

Если там уже настроены другие сайты, сохрани их блоки и добавь новый отдельно. Не удаляй настройки работающих сайтов. Caddy слушает внешний HTTPS, приложение — только локальный адрес 127.0.0.1:4173. Открывать 4173 наружу не требуется.

## 7. Порты

Google Cloud: добавь своей VM network tag skidka-web (Edit → Network tags → Save). Создай VPC firewall rule в той же сети, что VM: имя skidka-web, Direction Ingress, Action Allow, Targets Specified target tags → skidka-web, Source IPv4 ranges 0.0.0.0/0, Protocols and ports tcp:80,443. Существующие правила SSH сохрани. Если есть ограничения исходящего трафика, приложению нужны DNS, HTTPS TCP 443 и TCP 9000 к minio.skiftrade.kz для каталогов SMALL. Во входящие 9000 добавлять не нужно.

В сетевом экране панели сервера разреши входящие TCP 80 и 443. SSH-порт, которым пользуешься, должен оставаться разрешённым.

Если используешь UFW и SSH работает именно на стандартном 22, команды такие:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

При другом SSH-порте сначала разреши его вместо 22. Если UFW не установлен и firewall настраивается в панели провайдера, настрой эти порты там. При наличии обоих экранов правила нужны в обоих.

## 8. Включить приложение и HTTPS

```bash
sudo install -m 0644 /opt/po-skidke/deploy/po-skidke.service /etc/systemd/system/po-skidke.service
sudo systemctl daemon-reload
sudo systemctl enable --now po-skidke
sudo systemctl status po-skidke --no-pager
curl http://127.0.0.1:4173/health
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

`health` должен вернуть `{"ok":true}`. Если Node запускается, systemd показывает active (running). Caddy получит и будет продлевать сертификат, когда домен указывает на этот сервер и порты доступны. Покупать отдельный SSL-сертификат для этой схемы не нужно. Условия: https://caddyserver.com/docs/automatic-https

Открой `https://skidka.store`. Попробуй регистрацию, вход, сохранение фильтров, избранное, обновление цен и установку PWA. После перезагрузки сервера приложение и Caddy должны запускаться автоматически.

## 9. База и резервные копии

Пустая база создаётся автоматически. Чтобы сохранить данные старого сайта, нужен отдельный экспорт действующей базы и её перенос. В исходниках этих данных нет; тестовую локальную базу использовать как живую не нужно. После смены домена пользователям потребуется войти заново.

Ручная согласованная копия SQLite, включая актуальные данные WAL:

```bash
sudo -u po-skidke /usr/bin/node /opt/po-skidke/backup.mjs /var/lib/po-skidke/accounts.sqlite
```

Копия появится в `/var/lib/po-skidke/backups`. Скрипт проверяет её целостность. Не подменяй это обычным копированием одного sqlite-файла при работающем приложении.

Для ежедневного резервирования:

```bash
sudo install -m 0644 /opt/po-skidke/deploy/po-skidke-backup.service /etc/systemd/system/po-skidke-backup.service
sudo install -m 0644 /opt/po-skidke/deploy/po-skidke-backup.timer /etc/systemd/system/po-skidke-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now po-skidke-backup.timer
systemctl list-timers po-skidke-backup.timer
```

Время — 03:00 по часовому поясу сервера с небольшой случайной задержкой. Копии не удаляются автоматически: следи за свободным местом и периодически сохраняй копию вне VPS. Резервные файлы содержат личные данные и хеши паролей.

## 10. Если что-то не открывается

```bash
sudo journalctl -u po-skidke -n 80 --no-pager
sudo journalctl -u caddy -n 80 --no-pager
sudo systemctl status po-skidke caddy --no-pager
curl http://127.0.0.1:4173/health
```

| Симптом | Что проверить |
|---|---|
| Домен открывает парковку | A/CNAME, правильная DNS-панель, кеш DNS |
| Домен не отвечает | IP, входящие 80/443, работа Caddy |
| Caddy выдаёт 502 | Статус po-skidke, локальный health и порт 4173 |
| Нет сертификата HTTPS | A и ошибочная AAAA, доступность портов, журнал Caddy |
| Вход отклоняется как неверный источник | PUBLIC_ORIGIN точно совпадает с адресом сайта после редиректа |
| Permission denied для базы | Запускается ли service от po-skidke, находится ли база в /var/lib/po-skidke |
| Адрес 80/443 уже занят | На сервере работает другой веб-сервер; не запускай два сервера на одном порту |

## Обновление кода

Перед обновлением сделай резервную копию. Обнови код через GitHub:

```bash
cd ~/po-skidke-code
git pull --ff-only
sudo cp -a ~/po-skidke-code/. /opt/po-skidke/
sudo systemctl restart po-skidke
curl http://127.0.0.1:4173/health
```

База остаётся отдельно в `/var/lib/po-skidke`. Существующие `/etc/po-skidke.env` и Caddyfile повторно шаблонами не заменяй. При изменении схемы базы нужны отдельные миграции, а не удаление данных.

## Что проверено здесь

Код запуска и тесты проверены локально с Node.js 24: вход с HTTPS-origin за локальным прокси, Secure-cookie, сохранение аккаунтов после перезапуска, создание и проверка резервной копии. Команды apt/systemd/Caddy приведены для выполнения на Linux; на твоём VPS и с настоящим доменом они ещё не запускались.
