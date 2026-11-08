// Static description of the network: interface assignments, VLANs, the intended policy matrix
// and hand-written findings. It is documentation, not live state (live rules, rates and blocks come
// from the OPNsense and UniFi read-only APIs). This public copy ships an EXAMPLE network:
// replace it with your own export.
module.exports = {
  exportedOn: '2026-01-01',
  wan: { name: 'WAN', device: 'igc0', ident: 'wan' },
  trunk: { device: 'igc1', note: 'Parent of the four VLANs' },
  vpn: { name: 'VPN', device: 'wg0', ident: 'opt5', carries: 'Guest internet (policy route)' },
  vlans: [
    { id: 20, name: 'Home', ident: 'opt1', subnet: '10.20.20.0/24', gateway: '10.20.20.1' },
    { id: 30, name: 'Guest', ident: 'opt2', subnet: '10.20.30.0/24', gateway: '10.20.30.1', viaVpn: true },
    { id: 40, name: 'Internal', ident: 'opt3', subnet: '10.20.40.0/24', gateway: '10.20.40.1' },
    { id: 50, name: 'IoT', ident: 'opt4', subnet: '10.20.50.0/24', gateway: '10.20.50.1' },
  ],
  switches: ['Core switch', 'Access switch'],
  wired: { 40: [{ name: 'Proxmox host', detail: '10.20.40.10 · LXCs + VMs' }] },

  // allow | block | partial   (rows = traffic source, columns = destination)
  policyColumns: ['Home', 'Guest', 'Internal', 'IoT', 'Internet', 'Firewall'],
  policy: {
    Home: { Home: 'allow', Guest: 'block', Internal: 'block', IoT: 'partial', Internet: 'allow', Firewall: 'partial' },
    Guest: { Home: 'block', Guest: 'allow', Internal: 'block', IoT: 'block', Internet: 'partial', Firewall: 'partial' },
    Internal: { Home: 'block', Guest: 'block', Internal: 'allow', IoT: 'partial', Internet: 'allow', Firewall: 'allow' },
    IoT: { Home: 'block', Guest: 'block', Internal: 'block', IoT: 'allow', Internet: 'allow', Firewall: 'partial' },
  },
  policyNotes: {
    'Guest>Internet': 'Only through the VPN interface; DNS goes to the firewall',
    'Guest>Firewall': 'DNS (port 53) only',
    'Home>IoT': 'Casting / mDNS only',
    'Internal>IoT': 'Management ports only',
    'IoT>Firewall': 'DNS (port 53) only',
  },

  findings: [
    { level: 'green', title: 'Guest is isolated and routed through the VPN', detail: 'Guest can only reach the firewall for DNS and the internet through the VPN; every private range is blocked.' },
    { level: 'green', title: 'DNS-over-TLS bypass is blocked on all VLANs', detail: 'Port 853 is blocked outbound, so devices cannot skip the filtered resolver.' },
    { level: 'amber', title: 'Example: a pass rule sits below a catch-all block', detail: 'Rules are evaluated top-down, so this rule can never match. Move it above the block or delete it.' },
    { level: 'info', title: 'Example: an unused VLAN device exists on the trunk', detail: 'It has no interface, address or rules. Delete it if nothing uses it.' },
  ],
};
