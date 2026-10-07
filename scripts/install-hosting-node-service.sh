#!/bin/sh
set -eu
# Run as root on an enrolled hosting node; config and trusted bundle are provisioned separately.
: "${HOSTING_AGENT_DIR:?absolute agent directory required}"
: "${HOSTING_NODE_CONFIG:?absolute private node config required}"
case "$HOSTING_AGENT_DIR:$HOSTING_NODE_CONFIG" in *[!a-zA-Z0-9_./:-]*) echo 'Unsafe path'; exit 1;; esac
case "$HOSTING_AGENT_DIR" in /*) ;; *) exit 1;; esac
case "$HOSTING_NODE_CONFIG" in /*) ;; *) exit 1;; esac
[ -f "$HOSTING_NODE_CONFIG" ]
chmod 600 "$HOSTING_NODE_CONFIG"
python3 - "$HOSTING_NODE_CONFIG" <<'PY'
import json,sys,urllib.parse
c=json.load(open(sys.argv[1]));u=urllib.parse.urlsplit(c['stackUrl'])
assert u.scheme=='https' and not c.get('testLoopback'), 'Permanent service requires HTTPS'
assert c.get('gatewayConfigPath') and c.get('gatewayContainer'), 'Gateway config required'
assert not c.get('useCachedImagesOnly'), 'Permanent service must support registry pulls'
PY
cat > /etc/systemd/system/lingcoo-hosting.service <<UNIT
[Unit]
Description=Lingcoo hosting reconciliation
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 $HOSTING_AGENT_DIR/hosting-node-agent.py $HOSTING_NODE_CONFIG
TimeoutStartSec=30min
UMask=0077
UNIT
cat > /etc/systemd/system/lingcoo-hosting.timer <<'UNIT'
[Unit]
Description=Reconcile Lingcoo hosting once per minute
[Timer]
OnBootSec=30s
OnUnitInactiveSec=60s
Unit=lingcoo-hosting.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now lingcoo-hosting.timer
cat > /etc/systemd/system/lingcoo-hosting-backup.service <<UNIT
[Unit]
Description=Lingcoo managed instance backup
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 $HOSTING_AGENT_DIR/hosting-node-backup.py $HOSTING_NODE_CONFIG
TimeoutStartSec=60min
UMask=0077
UNIT
cat > /etc/systemd/system/lingcoo-hosting-backup.timer <<'UNIT'
[Unit]
Description=Daily Lingcoo managed instance backup
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
Unit=lingcoo-hosting-backup.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now lingcoo-hosting-backup.timer
