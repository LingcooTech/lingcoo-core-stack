#!/bin/sh
set -eu
: "${HOSTING_AGENT_DIR:?absolute issuer script directory required}"
: "${HOSTING_CERTIFICATE_CONFIG:?absolute private issuer config required}"
case "$HOSTING_AGENT_DIR:$HOSTING_CERTIFICATE_CONFIG" in /*:/*) ;; *) exit 1;; esac
case "$HOSTING_AGENT_DIR:$HOSTING_CERTIFICATE_CONFIG" in *[!a-zA-Z0-9_./:-]*) exit 1;; esac
chmod 600 "$HOSTING_CERTIFICATE_CONFIG"
cat > /etc/systemd/system/lingcoo-hosting-certificate.service <<UNIT
[Unit]
Description=Renew and distribute Lingcoo platform wildcard certificate
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 $HOSTING_AGENT_DIR/hosting-certificate-issue.py $HOSTING_CERTIFICATE_CONFIG
TimeoutStartSec=30min
UMask=0077
UNIT
cat > /etc/systemd/system/lingcoo-hosting-certificate.timer <<'UNIT'
[Unit]
Description=Check Lingcoo wildcard certificate twice daily
[Timer]
OnBootSec=5min
OnUnitInactiveSec=12h
RandomizedDelaySec=15min
Persistent=true
Unit=lingcoo-hosting-certificate.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now lingcoo-hosting-certificate.timer
