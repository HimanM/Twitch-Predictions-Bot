// ==UserScript==
// @name         Twitch Prediction Auto-Bet (Underdog)
// @namespace    https://twitch.tv/
// @version      1.1.2
// @description  Twitch prediction assistant with live odds panel, logs, manual controls, and optional auto-bet at T-5s.
// @author       https://github.com/HimanM
// @homepageURL  https://github.com/HimanM/Twitch-Predictions-Bot
// @supportURL   https://github.com/HimanM/Twitch-Predictions-Bot/issues
// @source       https://github.com/HimanM/Twitch-Predictions-Bot
// @downloadURL  https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/twitch-predictions.user.js
// @updateURL    https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/twitch-predictions.user.js
// @license      MIT
// @match        https://www.twitch.tv/*
// @exclude      https://www.twitch.tv/drops*
// @exclude      https://www.twitch.tv/directory*
// @exclude      https://www.twitch.tv/downloads*
// @exclude      https://www.twitch.tv/jobs*
// @exclude      https://www.twitch.tv/settings*
// @exclude      https://www.twitch.tv/subs*
// @exclude      https://www.twitch.tv/turbo*
// @exclude      https://www.twitch.tv/wallet*
// @grant        none
// @run-at       document-idle
// @icon         https://i.ibb.co/gbWGc64j/UNDERDOG-TW-PRED.png
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/config.js
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/utils.js
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/dom.js
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/strategy.js
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/bettor.js
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/ui.js
// @require      https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/modules/runner.js
// ==/UserScript==

(function () {
  "use strict";
  window.TPRED.runner.init();
})();
