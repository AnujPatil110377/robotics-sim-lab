#!/usr/bin/env bash
set -euo pipefail

CRD_USER=${CRD_USER:-crduser}
CRD_PASSWORD=${CRD_PASSWORD:-changeme}
CRD_CODE=${CRD_CODE:-}
CRD_EMAIL=${CRD_EMAIL:-}
CRD_HOSTNAME=${CRD_HOSTNAME:-Docker-CRD}

if ! id "${CRD_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${CRD_USER}"
  echo "${CRD_USER}:${CRD_PASSWORD}" | chpasswd
  usermod -aG chrome-remote-desktop "${CRD_USER}"
fi

echo "exec /usr/bin/xfce4-session" > "/home/${CRD_USER}/.chrome-remote-desktop-session"
chown ${CRD_USER}:${CRD_USER} "/home/${CRD_USER}/.chrome-remote-desktop-session"

# Ensure pulseaudio runtime dir exists
mkdir -p "/run/user/$(id -u ${CRD_USER})"
chown ${CRD_USER}:${CRD_USER} "/run/user/$(id -u ${CRD_USER})"

echo "[+] Starting D-Bus"
/etc/init.d/dbus start >/dev/null 2>&1 || true

if [[ -n "${CRD_CODE}" && -n "${CRD_EMAIL}" ]]; then
  echo "[+] Registering host with Chrome Remote Desktop"
  su - ${CRD_USER} -c "DISPLAY= /opt/google/chrome-remote-desktop/start-host --code='${CRD_CODE}' --redirect-url='https://remotedesktop.google.com/_/oauthredirect' --name='${CRD_HOSTNAME}' --pin='${CRD_PASSWORD}' --user='${CRD_EMAIL}'" || {
    echo "[!] Failed to register host. Check CRD_CODE and CRD_EMAIL." >&2
  }
else
  echo "[!] CRD_CODE or CRD_EMAIL env not set. Skipping automatic registration."
  echo "    Visit https://remotedesktop.google.com/headless to generate credentials."
fi

# Start Chrome Remote Desktop service
su - ${CRD_USER} -c "/opt/google/chrome-remote-desktop/chrome-remote-desktop --start"

# Ensure log file exists then follow it to keep container alive
LOG_FILE=/var/log/chrome_remote_desktop.log
touch "$LOG_FILE"
chown ${CRD_USER}:${CRD_USER} "$LOG_FILE"
tail -F "$LOG_FILE"
