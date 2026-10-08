// Icon set: Lucide (https://lucide.dev, ISC licence), embedded as one SVG sprite so the pages need no icon font or CDN.
// Use icon('search') in script, or <svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg> in markup.
(function () {
    var SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
        "<symbol id=\"i-search\" viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"8\" /><path d=\"m21 21-4.3-4.3\" /></symbol>" +
        "<symbol id=\"i-user\" viewBox=\"0 0 24 24\"><path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /><circle cx=\"12\" cy=\"7\" r=\"4\" /></symbol>" +
        "<symbol id=\"i-log-out\" viewBox=\"0 0 24 24\"><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" /><polyline points=\"16 17 21 12 16 7\" /><line x1=\"21\" x2=\"9\" y1=\"12\" y2=\"12\" /></symbol>" +
        "<symbol id=\"i-log-in\" viewBox=\"0 0 24 24\"><path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4\" /><polyline points=\"10 17 15 12 10 7\" /><line x1=\"15\" x2=\"3\" y1=\"12\" y2=\"12\" /></symbol>" +
        "<symbol id=\"i-house\" viewBox=\"0 0 24 24\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" /></symbol>" +
        "<symbol id=\"i-menu\" viewBox=\"0 0 24 24\"><line x1=\"4\" x2=\"20\" y1=\"12\" y2=\"12\" /><line x1=\"4\" x2=\"20\" y1=\"6\" y2=\"6\" /><line x1=\"4\" x2=\"20\" y1=\"18\" y2=\"18\" /></symbol>" +
        "<symbol id=\"i-x\" viewBox=\"0 0 24 24\"><path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" /></symbol>" +
        "<symbol id=\"i-check\" viewBox=\"0 0 24 24\"><path d=\"M20 6 9 17l-5-5\" /></symbol>" +
        "<symbol id=\"i-circle-check\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"m9 12 2 2 4-4\" /></symbol>" +
        "<symbol id=\"i-plus\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14\" /><path d=\"M12 5v14\" /></symbol>" +
        "<symbol id=\"i-pencil\" viewBox=\"0 0 24 24\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" /><path d=\"m15 5 4 4\" /></symbol>" +
        "<symbol id=\"i-trash-2\" viewBox=\"0 0 24 24\"><path d=\"M3 6h18\" /><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\" /><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\" /><line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\" /><line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\" /></symbol>" +
        "<symbol id=\"i-eye\" viewBox=\"0 0 24 24\"><path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /><circle cx=\"12\" cy=\"12\" r=\"3\" /></symbol>" +
        "<symbol id=\"i-eye-off\" viewBox=\"0 0 24 24\"><path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /><path d=\"m2 2 20 20\" /></symbol>" +
        "<symbol id=\"i-arrow-right\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14\" /><path d=\"m12 5 7 7-7 7\" /></symbol>" +
        "<symbol id=\"i-arrow-left\" viewBox=\"0 0 24 24\"><path d=\"m12 19-7-7 7-7\" /><path d=\"M19 12H5\" /></symbol>" +
        "<symbol id=\"i-chevron-down\" viewBox=\"0 0 24 24\"><path d=\"m6 9 6 6 6-6\" /></symbol>" +
        "<symbol id=\"i-chevron-left\" viewBox=\"0 0 24 24\"><path d=\"m15 18-6-6 6-6\" /></symbol>" +
        "<symbol id=\"i-chevron-right\" viewBox=\"0 0 24 24\"><path d=\"m9 18 6-6-6-6\" /></symbol>" +
        "<symbol id=\"i-chevron-up\" viewBox=\"0 0 24 24\"><path d=\"m18 15-6-6-6 6\" /></symbol>" +
        "<symbol id=\"i-clock\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /><polyline points=\"12 6 12 12 16 14\" /></symbol>" +
        "<symbol id=\"i-send\" viewBox=\"0 0 24 24\"><path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" /><path d=\"m21.854 2.147-10.94 10.939\" /></symbol>" +
        "<symbol id=\"i-refresh-cw\" viewBox=\"0 0 24 24\"><path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" /><path d=\"M21 3v5h-5\" /><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" /><path d=\"M8 16H3v5\" /></symbol>" +
        "<symbol id=\"i-file-text\" viewBox=\"0 0 24 24\"><path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /><path d=\"M14 2v4a2 2 0 0 0 2 2h4\" /><path d=\"M10 9H8\" /><path d=\"M16 13H8\" /><path d=\"M16 17H8\" /></symbol>" +
        "<symbol id=\"i-chart-column\" viewBox=\"0 0 24 24\"><path d=\"M3 3v16a2 2 0 0 0 2 2h16\" /><path d=\"M18 17V9\" /><path d=\"M13 17V5\" /><path d=\"M8 17v-3\" /></symbol>" +
        "<symbol id=\"i-shield-check\" viewBox=\"0 0 24 24\"><path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /><path d=\"m9 12 2 2 4-4\" /></symbol>" +
        "<symbol id=\"i-users\" viewBox=\"0 0 24 24\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /><circle cx=\"9\" cy=\"7\" r=\"4\" /><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\" /><path d=\"M16 3.13a4 4 0 0 1 0 7.75\" /></symbol>" +
        "<symbol id=\"i-message-square\" viewBox=\"0 0 24 24\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\" /></symbol>" +
        "<symbol id=\"i-database\" viewBox=\"0 0 24 24\"><ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\" /><path d=\"M3 5V19A9 3 0 0 0 21 19V5\" /><path d=\"M3 12A9 3 0 0 0 21 12\" /></symbol>" +
        "<symbol id=\"i-image\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /><circle cx=\"9\" cy=\"9\" r=\"2\" /><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" /></symbol>" +
        "<symbol id=\"i-bold\" viewBox=\"0 0 24 24\"><path d=\"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8\" /></symbol>" +
        "<symbol id=\"i-italic\" viewBox=\"0 0 24 24\"><line x1=\"19\" x2=\"10\" y1=\"4\" y2=\"4\" /><line x1=\"14\" x2=\"5\" y1=\"20\" y2=\"20\" /><line x1=\"15\" x2=\"9\" y1=\"4\" y2=\"20\" /></symbol>" +
        "<symbol id=\"i-quote\" viewBox=\"0 0 24 24\"><path d=\"M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z\" /><path d=\"M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z\" /></symbol>" +
        "<symbol id=\"i-heading-3\" viewBox=\"0 0 24 24\"><path d=\"M4 12h8\" /><path d=\"M4 18V6\" /><path d=\"M12 18V6\" /><path d=\"M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2\" /><path d=\"M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2\" /></symbol>" +
        "<symbol id=\"i-pilcrow\" viewBox=\"0 0 24 24\"><path d=\"M13 4v16\" /><path d=\"M17 4v16\" /><path d=\"M19 4H9.5a4.5 4.5 0 0 0 0 9H13\" /></symbol>" +
        "<symbol id=\"i-columns-2\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M12 3v18\" /></symbol>" +
        "<symbol id=\"i-triangle-alert\" viewBox=\"0 0 24 24\"><path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /><path d=\"M12 9v4\" /><path d=\"M12 17h.01\" /></symbol>" +
        "<symbol id=\"i-info\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 16v-4\" /><path d=\"M12 8h.01\" /></symbol>" +
        "<symbol id=\"i-circle-alert\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" /></symbol>" +
        "<symbol id=\"i-cloud\" viewBox=\"0 0 24 24\"><path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\" /></symbol>" +
        "<symbol id=\"i-sun\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"4\" /><path d=\"M12 2v2\" /><path d=\"M12 20v2\" /><path d=\"m4.93 4.93 1.41 1.41\" /><path d=\"m17.66 17.66 1.41 1.41\" /><path d=\"M2 12h2\" /><path d=\"M20 12h2\" /><path d=\"m6.34 17.66-1.41 1.41\" /><path d=\"m19.07 4.93-1.41 1.41\" /></symbol>" +
        "<symbol id=\"i-moon\" viewBox=\"0 0 24 24\"><path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\" /></symbol>" +
        "<symbol id=\"i-cloud-sun\" viewBox=\"0 0 24 24\"><path d=\"M12 2v2\" /><path d=\"m4.93 4.93 1.41 1.41\" /><path d=\"M20 12h2\" /><path d=\"m19.07 4.93-1.41 1.41\" /><path d=\"M15.947 12.65a4 4 0 0 0-5.925-4.128\" /><path d=\"M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z\" /></symbol>" +
        "<symbol id=\"i-cloud-rain\" viewBox=\"0 0 24 24\"><path d=\"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242\" /><path d=\"M16 14v6\" /><path d=\"M8 14v6\" /><path d=\"M12 16v6\" /></symbol>" +
        "<symbol id=\"i-cloud-drizzle\" viewBox=\"0 0 24 24\"><path d=\"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242\" /><path d=\"M8 19v1\" /><path d=\"M8 14v1\" /><path d=\"M16 19v1\" /><path d=\"M16 14v1\" /><path d=\"M12 21v1\" /><path d=\"M12 16v1\" /></symbol>" +
        "<symbol id=\"i-cloud-lightning\" viewBox=\"0 0 24 24\"><path d=\"M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973\" /><path d=\"m13 12-3 5h4l-3 5\" /></symbol>" +
        "<symbol id=\"i-cloud-fog\" viewBox=\"0 0 24 24\"><path d=\"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242\" /><path d=\"M16 17H7\" /><path d=\"M17 21H9\" /></symbol>" +
        "<symbol id=\"i-snowflake\" viewBox=\"0 0 24 24\"><line x1=\"2\" x2=\"22\" y1=\"12\" y2=\"12\" /><line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"22\" /><path d=\"m20 16-4-4 4-4\" /><path d=\"m4 8 4 4-4 4\" /><path d=\"m16 4-4 4-4-4\" /><path d=\"m8 20 4-4 4 4\" /></symbol>" +
        "<symbol id=\"i-wind\" viewBox=\"0 0 24 24\"><path d=\"M12.8 19.6A2 2 0 1 0 14 16H2\" /><path d=\"M17.5 8a2.5 2.5 0 1 1 2 4H2\" /><path d=\"M9.8 4.4A2 2 0 1 1 11 8H2\" /></symbol>" +
        "<symbol id=\"i-lock\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /><path d=\"M7 11V7a5 5 0 0 1 10 0v4\" /></symbol>" +
        "<symbol id=\"i-layout-grid\" viewBox=\"0 0 24 24\"><rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" /><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\" /><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" /><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" /></symbol>" +
        "<symbol id=\"i-external-link\" viewBox=\"0 0 24 24\"><path d=\"M15 3h6v6\" /><path d=\"M10 14 21 3\" /><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" /></symbol>" +
        "<symbol id=\"i-tag\" viewBox=\"0 0 24 24\"><path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" /></symbol>" +
        "<symbol id=\"i-trending-up\" viewBox=\"0 0 24 24\"><polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\" /><polyline points=\"16 7 22 7 22 13\" /></symbol>" +
        "<symbol id=\"i-flag\" viewBox=\"0 0 24 24\"><path d=\"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z\" /><line x1=\"4\" x2=\"4\" y1=\"22\" y2=\"15\" /></symbol>" +
        "<symbol id=\"i-inbox\" viewBox=\"0 0 24 24\"><polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\" /><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\" /></symbol>" +
        "<symbol id=\"i-save\" viewBox=\"0 0 24 24\"><path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" /><path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" /><path d=\"M7 3v4a1 1 0 0 0 1 1h7\" /></symbol>" +
        "<symbol id=\"i-undo-2\" viewBox=\"0 0 24 24\"><path d=\"M9 14 4 9l5-5\" /><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\" /></symbol>" +
        "<symbol id=\"i-folder\" viewBox=\"0 0 24 24\"><path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" /></symbol>" +
        "<symbol id=\"i-link\" viewBox=\"0 0 24 24\"><path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\" /><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\" /></symbol>" +
        "<symbol id=\"i-copy\" viewBox=\"0 0 24 24\"><rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" /></symbol>" +
        "<symbol id=\"i-share-2\" viewBox=\"0 0 24 24\"><circle cx=\"18\" cy=\"5\" r=\"3\" /><circle cx=\"6\" cy=\"12\" r=\"3\" /><circle cx=\"18\" cy=\"19\" r=\"3\" /><line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\" /><line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\" /></symbol>" +
        "<symbol id=\"i-newspaper\" viewBox=\"0 0 24 24\"><path d=\"M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2\" /><path d=\"M18 14h-8\" /><path d=\"M15 18h-5\" /><path d=\"M10 6h8v4h-8V6Z\" /></symbol>" +
        "<symbol id=\"i-square-pen\" viewBox=\"0 0 24 24\"><path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\" /><path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\" /></symbol>" +
        "<symbol id=\"i-sparkles\" viewBox=\"0 0 24 24\"><path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" /><path d=\"M20 3v4\" /><path d=\"M22 5h-4\" /><path d=\"M4 17v2\" /><path d=\"M5 18H3\" /></symbol>" +
        "<symbol id=\"i-flame\" viewBox=\"0 0 24 24\"><path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z\" /></symbol>" +
        "<symbol id=\"i-hourglass\" viewBox=\"0 0 24 24\"><path d=\"M5 22h14\" /><path d=\"M5 2h14\" /><path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\" /><path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\" /></symbol>" +
        "<symbol id=\"i-history\" viewBox=\"0 0 24 24\"><path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /><path d=\"M3 3v5h5\" /><path d=\"M12 7v5l4 2\" /></symbol>" +
        "<symbol id=\"i-file-diff\" viewBox=\"0 0 24 24\"><path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /><path d=\"M9 10h6\" /><path d=\"M12 13V7\" /><path d=\"M9 17h6\" /></symbol>" +
        "<symbol id=\"i-globe\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /><path d=\"M2 12h20\" /></symbol>" +
        "<symbol id=\"i-files\" viewBox=\"0 0 24 24\"><path d=\"M20 7h-3a2 2 0 0 1-2-2V2\" /><path d=\"M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z\" /><path d=\"M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8\" /></symbol>" +
        "<symbol id=\"i-list\" viewBox=\"0 0 24 24\"><path d=\"M3 12h.01\" /><path d=\"M3 18h.01\" /><path d=\"M3 6h.01\" /><path d=\"M8 12h13\" /><path d=\"M8 18h13\" /><path d=\"M8 6h13\" /></symbol>" +
        "<symbol id=\"i-check-check\" viewBox=\"0 0 24 24\"><path d=\"M18 6 7 17l-5-5\" /><path d=\"m22 10-7.5 7.5L13 16\" /></symbol>" +
        "<symbol id=\"i-circle\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /></symbol>" +
        "<symbol id=\"i-filter\" viewBox=\"0 0 24 24\"><polygon points=\"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3\" /></symbol>" +
        "<symbol id=\"i-calendar\" viewBox=\"0 0 24 24\"><path d=\"M8 2v4\" /><path d=\"M16 2v4\" /><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /><path d=\"M3 10h18\" /></symbol>" +
        "<symbol id=\"i-arrow-up\" viewBox=\"0 0 24 24\"><path d=\"m5 12 7-7 7 7\" /><path d=\"M12 19V5\" /></symbol>" +
        "<symbol id=\"i-trending-down\" viewBox=\"0 0 24 24\"><polyline points=\"22 17 13.5 8.5 8.5 13.5 2 7\" /><polyline points=\"16 17 22 17 22 11\" /></symbol>" +
        "<symbol id=\"i-sliders-horizontal\" viewBox=\"0 0 24 24\"><line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\" /><line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\" /><line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\" /><line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\" /><line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\" /><line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\" /><line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\" /><line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\" /><line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\" /></symbol>" +
        "<symbol id=\"i-loader-circle\" viewBox=\"0 0 24 24\"><path d=\"M21 12a9 9 0 1 1-6.219-8.56\" /></symbol>" +
        "<symbol id=\"i-badge-check\" viewBox=\"0 0 24 24\"><path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /><path d=\"m9 12 2 2 4-4\" /></symbol>" +
        "<symbol id=\"i-pen-line\" viewBox=\"0 0 24 24\"><path d=\"M12 20h9\" /><path d=\"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z\" /></symbol>" +
        "<symbol id=\"i-user-plus\" viewBox=\"0 0 24 24\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /><circle cx=\"9\" cy=\"7\" r=\"4\" /><line x1=\"19\" x2=\"19\" y1=\"8\" y2=\"14\" /><line x1=\"22\" x2=\"16\" y1=\"11\" y2=\"11\" /></symbol>" +
        "<symbol id=\"i-layers\" viewBox=\"0 0 24 24\"><path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" /><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" /><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" /></symbol>" +
        "<symbol id=\"i-book-open\" viewBox=\"0 0 24 24\"><path d=\"M12 7v14\" /><path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" /></symbol>" +
        "<symbol id=\"i-scroll-text\" viewBox=\"0 0 24 24\"><path d=\"M15 12h-5\" /><path d=\"M15 8h-5\" /><path d=\"M19 17V5a2 2 0 0 0-2-2H4\" /><path d=\"M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3\" /></symbol>" +
        '</svg>';

    function mountSprite() {
        if (document.getElementById('i-search') || !document.body) return;
        document.body.insertAdjacentHTML('afterbegin', SPRITE);
    }

    // shell.js calls this as soon as <body> exists, so icons are there from the first paint
    window.mountIcons = mountSprite;
    if (document.body) mountSprite();
    else document.addEventListener('DOMContentLoaded', mountSprite);

    // Markup for an icon, to be used inside template strings
    window.icon = function (name, extraClass) {
        return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
    };
    window.ICON_NAMES = ["search","user","log-out","log-in","house","menu","x","check","circle-check","plus","pencil","trash-2","eye","eye-off","arrow-right","arrow-left","chevron-down","chevron-left","chevron-right","chevron-up","clock","send","refresh-cw","file-text","chart-column","shield-check","users","message-square","database","image","bold","italic","quote","heading-3","pilcrow","columns-2","triangle-alert","info","circle-alert","cloud","sun","moon","cloud-sun","cloud-rain","cloud-drizzle","cloud-lightning","cloud-fog","snowflake","wind","lock","layout-grid","external-link","tag","trending-up","flag","inbox","save","undo-2","folder","link","copy","share-2","newspaper","square-pen","sparkles","flame","hourglass","history","file-diff","globe","files","list","check-check","circle","filter","calendar","arrow-up","trending-down","sliders-horizontal","loader-circle","badge-check","pen-line","user-plus","layers","book-open","scroll-text"];
})();
