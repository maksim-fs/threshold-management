/**
 * Applies English UI to custom-threshold / ROI placeholder pages
 * when localStorage threshold_mgmt_lang === "en".
 */
(function () {
  "use strict";

  var L = "threshold_mgmt_lang";
  var texts = {
    custom: {
      title: "Production data – Custom thresholds",
      brand: "Production data",
      brandMeta: "Custom thresholds",
      backNav: "← Back to threshold management",
      h1: "Custom thresholds",
      p: "Use this page for product-specific custom threshold options. You can add forms and API hooks in a later iteration.",
      btn: "Back to threshold management",
    },
    roi: {
      title: "ROI threshold detail",
      brand: "Production data",
      brandMeta: "ROI threshold view",
      backNav: "Back to threshold management",
      h1: "ROI rule detail (placeholder)",
      tip: "This is the next level after ROI in the main table. Add fields and interactions here in a follow-up pass.",
      btn: "Back",
    },
  };

  function isEn() {
    return localStorage.getItem(L) === "en";
  }

  function setText(id, s) {
    var el = document.getElementById(id);
    if (el) el.textContent = s;
  }

  function apply() {
    if (!isEn()) return;
    document.documentElement.setAttribute("lang", "en");
    if (document.body) document.body.classList.add("lang-en");
    var page = document.body && document.body.getAttribute("data-subpage");
    if (page === "custom") {
      var c = texts.custom;
      document.title = c.title;
      setText("sp-brand", c.brand);
      setText("sp-brand-meta", c.brandMeta);
      setText("sp-back", c.backNav);
      setText("sp-h1", c.h1);
      setText("sp-lead", c.p);
      setText("sp-btn", c.btn);
    }
    if (page === "roi") {
      var r = texts.roi;
      document.title = r.title;
      setText("sp-brand", r.brand);
      setText("sp-brand-meta", r.brandMeta);
      setText("sp-back", r.backNav);
      setText("sp-h1", r.h1);
      setText("sp-lead", r.tip);
      setText("sp-btn", r.btn);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
