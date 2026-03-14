/**
 * utils.js — Pure utility functions: text parsing, HTML escaping, and timing helpers.
 * No dependencies on other TPRED modules.
 */
(function () {
  "use strict";

  const T = window.TPRED;

  function parsePoints(text) {
    if (!text) return 0;
    const s = String(text).trim().replace(/,/g, "");
    const num = parseFloat(s);
    if (Number.isNaN(num)) return 0;
    if (/k$/i.test(s)) return Math.round(num * 1_000);
    if (/m$/i.test(s)) return Math.round(num * 1_000_000);
    return Math.round(num);
  }

  function parseStatusText(text) {
    const t = (text ?? "").toLowerCase();
    if (t.includes("closing in")) return "ACTIVE";
    if (t.includes("closed") || t.includes("waiting for result")) return "LOCKED";
    if (t.includes("resolved") || t.includes("winner") || t.includes("ended")) return "RESOLVED";
    if (t.includes("cancel")) return "CANCELED";
    if (/\d/.test(t)) return "ACTIVE";
    return "UNKNOWN";
  }

  function parseTimerText(text) {
    if (!text) return Infinity;
    const t = text.toLowerCase();

    const colon = t.match(/(\d+):(\d{2})/);
    if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);

    const ms = t.match(/(\d+)\s*m\w*\s+(\d+)\s*s/);
    if (ms) return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);

    const mins = t.match(/(\d+)\s*min/);
    if (mins) return parseInt(mins[1], 10) * 60;

    const secs = t.match(/(\d+)\s*s/);
    if (secs) return parseInt(secs[1], 10);

    return Infinity;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  T.parsePoints = parsePoints;
  T.parseStatusText = parseStatusText;
  T.parseTimerText = parseTimerText;
  T.escapeHtml = escapeHtml;
  T.fmtTime = fmtTime;
  T.sleep = sleep;
})();
