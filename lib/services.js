// Static directory of the homelab: what runs where, how it runs, and where its
// web UI lives. Source of truth is /opt/stack/homelab-reference.md on LXC 110 -
// keep the two in sync. `units` / `containers` are what Prxy Core may restart; they must
// match /etc/prxy-action.allow on that LXC (the LXC-side list is the real gate).
const GUESTS = {
  110: { name: 'mgmt-docker', ip: '10.20.40.110', role: 'Docker host (shared)', runtime: 'docker-host', containers: ['agent-panel', 'autotrack-backend', 'autotrack-frontend', 'bot-code-editor', 'cadvisor', 'cloudflared', 'discord-bot', 'docker-socket-proxy', 'homepage', 'minigames', 'minigames-api', 'npm', 'portainer', 'system-health'], backupDirs: [
    { label: 'autotrack', title: 'AutoTrack app backup (uploads, source, secrets)', path: '/var/backups/autotrack' },
    { label: 'autotrack-mirror', title: 'AutoTrack database dumps (pulled from .111)', path: '/var/backups/autotrack-mirror' },
  ] },
  111: { name: 'pg-postgres', ip: '10.20.40.111', role: 'PostgreSQL', runtime: 'systemd', units: ['postgresql@15-main'] },
  112: { name: 'pg-redis', ip: '10.20.40.112', role: 'Redis', runtime: 'systemd', units: ['redis-server'] },
  113: { name: 'pg-mongodb', ip: '10.20.40.113', role: 'MongoDB', runtime: 'systemd', units: ['mongod'] },
  114: { name: 'pg-influxdb', ip: '10.20.40.114', role: 'InfluxDB', runtime: 'systemd', units: ['influxdb'] },
  115: { name: 'grafana', ip: '10.20.40.115', role: 'Grafana', runtime: 'systemd', url: 'http://10.20.40.115:3000', units: ['grafana-server'] },
  116: { name: 'prometheus', ip: '10.20.40.116', role: 'Prometheus', runtime: 'systemd', url: 'http://10.20.40.116:9090', units: ['prometheus'] },
  117: { name: 'alertmanager', ip: '10.20.40.117', role: 'Alertmanager', runtime: 'systemd', url: 'http://10.20.40.117:9093', units: ['alertmanager'] },
  118: { name: 'n8n', ip: '10.20.40.118', role: 'n8n automations', runtime: 'systemd', url: 'http://10.20.40.118:5678', units: ['n8n'] },
  119: { name: 'nextcloud', ip: '10.20.40.119', role: 'Nextcloud', runtime: 'systemd', url: 'http://10.20.40.119', units: ['nginx', 'php8.2-fpm'] },
  120: { name: 'wikijs', ip: '10.20.40.120', role: 'Wiki.js', runtime: 'systemd', url: 'http://10.20.40.120:3000', units: ['wikijs'] },
  121: { name: 'uptime-kuma', ip: '10.20.40.121', role: 'Uptime Kuma', runtime: 'systemd', url: 'http://10.20.40.121:3001', units: ['uptime-kuma'] },
  122: { name: 'code-server', ip: '10.20.40.122', role: 'code-server', runtime: 'systemd', url: 'http://10.20.40.122:8443', units: ['code-server@root'] },
  123: { name: 'dbeaver', ip: '10.20.40.123', role: 'CloudBeaver', runtime: 'systemd', url: 'http://10.20.40.123:8978', containers: ['cloudbeaver'] },
  124: { name: 'open-webui', ip: '10.20.40.124', role: 'Open WebUI', runtime: 'systemd', url: 'http://10.20.40.124:8080', units: ['open-webui'] },
  125: { name: 'searxng', ip: '10.20.40.125', role: 'SearXNG', runtime: 'systemd', url: 'http://10.20.40.125:8888', units: ['searxng'] },
  126: { name: 'speedtest-tracker', ip: '10.20.40.126', role: 'Speedtest Tracker', runtime: 'systemd', url: 'http://10.20.40.126', units: ['nginx', 'php8.2-fpm'], containers: ['speedtest-tracker'] },
  127: { name: 'smokeping', ip: '10.20.40.127', role: 'SmokePing', runtime: 'systemd', url: 'http://10.20.40.127', units: ['apache2', 'smokeping'] },
  128: { name: 'goflow2', ip: '10.20.40.128', role: 'NetFlow collector', runtime: 'systemd', units: ['goflow2', 'promtail'] },
  129: { name: 'unbound', ip: '10.20.40.129', role: 'Unbound DNS resolver', runtime: 'systemd', units: ['unbound'] },
  130: { name: 'proxmox-exporter', ip: '10.20.40.130', role: 'pve-exporter', runtime: 'systemd', units: ['pve-exporter'] },
  131: { name: 'ollama', ip: '10.20.40.131', role: 'Ollama (RTX 3060)', runtime: 'systemd', url: 'http://10.20.40.131:11434', units: ['ollama'] },
  132: { name: 'homeassistant', ip: '10.20.40.132', role: 'Home Assistant + MQTT', runtime: 'systemd', url: 'http://10.20.40.132:8123', units: ['aferiy-exporter', 'mosquitto'], containers: ['homeassistant'] },
  133: { name: 'loki', ip: '10.20.40.133', role: 'Loki + Promtail', runtime: 'systemd', url: 'http://10.20.40.133:3100/ready', units: ['loki', 'promtail'] },
  134: { name: 'nextdns-exporter', ip: '10.20.40.135', role: 'NextDNS exporter', runtime: 'systemd', units: ['nextdns-exporter'] },
  136: { name: 'prxy-core', ip: '10.20.40.136', role: 'Prxy Core (this app)', runtime: 'systemd', url: 'https://10.20.40.136:8443' },
};

// Web UIs that live in Docker on LXC 110 or on the Proxmox host itself.
const EXTRA_LINKS = [
  { name: 'Proxmox', url: 'https://10.20.40.224:8006', where: 'host' },
  { name: 'Portainer', url: 'http://10.20.40.110:9000', where: 'docker' },
  { name: 'Nginx Proxy Manager', url: 'http://10.20.40.110:8181', where: 'docker' },
  { name: 'Homepage', url: 'http://10.20.40.110:7575', where: 'docker' },
];

// Known-benign log noise, mirrored from the reference doc so the UI can say so.
const BENIGN = {
  cadvisor: 'Logs "Failed to get system UUID" every 5 min - cosmetic, metrics are fine.',
  'docker-socket-proxy': 'Periodic HAProxy worker restarts/warnings are vendor defaults - harmless.',
};

module.exports = { GUESTS, EXTRA_LINKS, BENIGN };
