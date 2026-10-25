(function () {
  'use strict';
  // Ikon garis ringkas (24x24, stroke). Dilukis sendiri supaya app tidak bergantung pada CDN.
  const P = {
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2c2.2.2 3.9 1.7 4.4 4.3"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9 9.5v10M14.5 9.5v10"/>',
    swap: '<path d="M4.5 8h14l-3.5-3.5M19.5 16h-14l3.5 3.5"/>',
    chart: '<path d="M5 19.5V11M10 19.5V5M15 19.5v-6M20 19.5V8.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M5.6 18.4l1.9-1.9M16.5 7.5l1.9-1.9"/>',
    help: '<circle cx="12" cy="12" r="8.8"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.1-2.5 3.8"/><path d="M12 17h.01"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.3a2 2 0 0 0 4 0"/>',
    chevDown: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
    chevLeft: '<path d="M14.5 6l-6 6 6 6"/>',
    chevRight: '<path d="M9.5 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    file: '<path d="M7 3.5h7l4.5 4.5v12.5H7z"/><path d="M14 3.5V8h4.5M9.8 13h5.4M9.8 16.5h5.4"/>',
    check: '<circle cx="12" cy="12" r="8.6"/><path d="M8.4 12.2l2.5 2.5 4.8-5"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M12 4.2l8.6 15.3H3.4z"/><path d="M12 10v4.2M12 17h.01"/>',
    printer: '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7 13.5h10v7H7z"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 19.5h15"/>',
    cloud: '<path d="M7.2 18.5h9.6a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.7 1.4 3.3 3.3 0 0 0 .6 6.6z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
    shield: '<path d="M12 3.5l7 3v5.4c0 4.4-3 7.6-7 9.1-4-1.5-7-4.7-7-9.1V6.5z"/>',
    layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/>',
    spark: '<path d="M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/>',
    logout: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9.5"/>',
    message: '<path d="M4.5 19l1.3-3.7A7.5 7.5 0 1 1 9 18.4z"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    edit: '<path d="M4.5 19.5l1-4.5L15.5 5l3.5 3.5-10 10z"/>',
    book: '<path d="M5 5.5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20.5v-15"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 13.5v6H4.5V7H10"/>',
    database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>'
  };
  window.UI_ICON = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
})();
