(function () {
  "use strict";

  var LS_DEPLOYED = "threshold_project_config_v1";
  var LS_DRAFT = "threshold_project_config_draft_v1";
  var LS_DEPLOY_TS = "threshold_project_config_deploy_ts";

  var EMPTY_PROJECT_CONFIG = { visions: [], features: [] };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function safeId(raw, fallback) {
    var s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return s || fallback;
  }
  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 8);
  }
  function normalize(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var out = {
      visions: Array.isArray(src.visions) ? src.visions : [],
      features: Array.isArray(src.features) ? src.features : [],
    };
    /* 不自动用默认项填满空数组；由用户点「+」新建 */
    out.features = (out.features || []).map(function (f, i) {
      return {
        id: safeId(f.id, "feature_" + (i + 1)),
        name: String(f.name || "Feature_" + (i + 1)),
        icon: f.icon === "ok" ? "ok" : "neg",
        configured: f.configured !== false,
      };
    });
    out.visions = (out.visions || []).map(function (v, vi) {
      var ccs = Array.isArray(v.ccs) && v.ccs.length ? v.ccs : [];
      return {
        id: safeId(v.id, "vision_" + (vi + 1)),
        name: String(v.name || "视野_" + (vi + 1)),
        repeat: Math.max(1, parseInt(v.repeat, 10) || 1),
        ccs: ccs.map(function (cc, ci) {
          return {
            id: safeId(cc.id, "cc_" + (ci + 1)),
            name: String(cc.name || "CC_" + (ci + 1)),
            featureIds: Array.isArray(cc.featureIds) ? cc.featureIds.map(String) : [],
          };
        }),
      };
    });
    return out;
  }

  function loadInitial() {
    try {
      var dr = localStorage.getItem(LS_DRAFT);
      if (dr) return normalize(JSON.parse(dr));
    } catch (e) {}
    try {
      var dep = localStorage.getItem(LS_DEPLOYED);
      if (dep) return normalize(JSON.parse(dep));
    } catch (e) {}
    return normalize(clone(EMPTY_PROJECT_CONFIG));
  }

  function saveDraft() {
    try {
      localStorage.setItem(LS_DRAFT, JSON.stringify(config));
    } catch (e) {}
  }

  var TI = window.ThresholdI18n;
  function t(k) {
    return (TI && TI.t && TI.t(k)) || k;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function $(id) {
    return document.getElementById(id);
  }

  var config = loadInitial();

  var selectedVisionId = config.visions[0] ? config.visions[0].id : "";
  var selectedCcId =
    config.visions[0] && config.visions[0].ccs && config.visions[0].ccs[0] ? config.visions[0].ccs[0].id : "";

  function findVisionById(vid) {
    return config.visions.find(function (v) {
      return v.id === vid;
    });
  }
  function findCc(v, ccid) {
    return v && v.ccs
      ? v.ccs.find(function (c) {
          return c.id === ccid;
        })
      : null;
  }
  function selectedVision() {
    return findVisionById(selectedVisionId) || null;
  }
  function selectedCc() {
    var v = selectedVision();
    if (!v) return null;
    return findCc(v, selectedCcId) || null;
  }
  function ensureSelection() {
    if (!config.visions.length) {
      selectedVisionId = "";
      selectedCcId = "";
      return;
    }
    if (!findVisionById(selectedVisionId)) selectedVisionId = config.visions[0].id;
    var v0 = findVisionById(selectedVisionId);
    if (!v0) return;
    if (Array.isArray(v0.ccs) && v0.ccs.length === 0) {
      selectedCcId = "";
      return;
    }
    if (v0 && v0.ccs && v0.ccs.length) {
      if (!findCc(v0, selectedCcId)) selectedCcId = v0.ccs[0] ? v0.ccs[0].id : "";
    }
  }

  function countImages(vision) {
    var r = Math.max(1, parseInt(vision.repeat, 10) || 1);
    var ncc = (vision.ccs && vision.ccs.length) || 0;
    return ncc * r;
  }

  function boundFeaturePillsHtml(cc) {
    var ids = (cc && Array.isArray(cc.featureIds) && cc.featureIds.length) ? cc.featureIds : [];
    if (!ids.length) {
      return (
        '<span class="pc-cc-feat-empty">' +
        esc(t("pcCcNoBoundDefects")) +
        "</span>"
      );
    }
    return ids
      .map(function (fid) {
        var f = config.features.find(function (x) {
          return x.id === fid;
        });
        var label = f ? f.name : fid;
        return '<span class="pc-cc-feat-pill">' + esc(label) + "</span>";
      })
      .join("");
  }

  function buildFeatureListHtml() {
    var lines = config.features
      .map(function (f) {
        return (
          '<li class="pc-feat-row">' +
          "<input class=\"pc-input pc-feat-inp\" type=\"text\" data-feature-name=\"" +
          esc(f.id) +
          '" value="' +
          esc(f.name) +
          '"/><button type="button" class="btn btn-ghost btn-sm" data-action="del-feat" data-fid="' +
          esc(f.id) +
          '">' +
          esc(t("pcDelete")) +
          "</button></li>"
        );
      })
      .join("");
    return (
      '<h3 class="pc-subh">' +
      esc(t("pcFeatureLib")) +
      '</h3><div class="pc-sec-hrow"><button type="button" class="btn btn-outline btn-sm" id="btn-add-feature">' +
      esc(t("pcAddFeature")) +
      "</button></div><ul class=\"pc-feat-lib\">" +
      (lines
        ? lines
        : '<li class="pc-empty-feat"><p class="pc-empty-t">' +
          esc(t("pcEmptyFeaturesBlock")) +
          "</p></li>") +
      "</ul>"
    );
  }

  function buildCheckboxesForSelected() {
    var v = selectedVision();
    var cc = selectedCc();
    if (!v || !cc) {
      return '<p class="pc-pick-hint pc-muted">' + esc(t("pcPickCcFirst")) + "</p>";
    }
    if (!config.features.length) return '<p class="pc-muted">' + esc(t("pcNoFeatures")) + "</p>";
    return config.features
      .map(function (f) {
        var on = cc.featureIds.indexOf(f.id) >= 0;
        return (
          "<label class=\"pc-chk\"><input type=\"checkbox\" data-vision-id=\"" +
          esc(v.id) +
          "\" data-cc-id=\"" +
          esc(cc.id) +
          "\" data-fid=\"" +
          esc(f.id) +
          '"' +
          (on ? " checked" : "") +
          " />" +
          esc(f.name) +
          "</label>"
        );
      })
      .join("");
  }

  function buildLeftColumn() {
    var vBlocks = config.visions
      .map(function (v) {
        var nImg = countImages(v);
        var ncc = v.ccs && v.ccs.length ? v.ccs.length : 0;
        var r = v.repeat;
        var hint = t("pcImageHint");
        if (typeof hint === "string") {
          hint = hint.replace("{n}", String(nImg)).replace("{cc}", String(ncc)).replace("{r}", String(r));
        }
        var ccs = (v.ccs || [])
          .map(function (cc) {
            var sel = v.id === selectedVisionId && cc.id === selectedCcId;
            return (
              '<div class="pc-sel-cc' +
              (sel ? " is-selected" : "") +
              '" data-sel-v="' +
              esc(v.id) +
              '" data-sel-c="' +
              esc(cc.id) +
              '"><div class="pc-sel-cc-ctrl"><span class="pc-ccline-mark"></span><span class="pc-clip">' +
              esc(t("pcLabelCc")) +
              ":</span><input class=\"pc-input pc-inp-s\" type=\"text\" data-cc-name data-vision-id=\"" +
              esc(v.id) +
              '" data-cc-id="' +
              esc(cc.id) +
              '" value="' +
              esc(cc.name) +
              '"><button type="button" class="btn btn-ghost btn-sm" data-action="del-cc" data-vision-id="' +
              esc(v.id) +
              '" data-cc-id="' +
              esc(cc.id) +
              '">' +
              esc(t("pcDelete")) +
              '</button></div><div class="pc-cc-bound pc-cc-bound--inline"><span class="pc-cc-bound-lbl">' +
              esc(t("pcCcBoundDefects")) +
              ':</span><div class="pc-cc-feat-pills">' +
              boundFeaturePillsHtml(cc) +
              "</div></div></div>"
            );
          })
          .join("");
        var emptyCcHint =
          !v.ccs || v.ccs.length === 0
            ? '<p class="pc-empty-inline pc-muted">' + esc(t("pcEmptyCcs")) + "</p>"
            : "";
        return (
          '<div class="pc-vision-blk" data-vision-blk-id="' +
          esc(v.id) +
          '"><div class="pc-vision-h-compact">' +
          "<span class=\"pc-clip\">" +
          esc(t("pcLabelVision")) +
          ":</span><input class=\"pc-input pc-inp-s\" data-vision-name data-vision-id=\"" +
          esc(v.id) +
          '" value="' +
          esc(v.name) +
          '"><div class="pc-vision-ops-c">' +
          "<span class=\"pc-clip-dim\">" +
          esc(t("pcLabelRepeat")) +
          ":</span><input class=\"pc-input pc-inp-n\" type=\"number\" min=\"1\" data-vision-repeat data-vision-id=\"" +
          esc(v.id) +
          '" value="' +
          r +
          '"><button type="button" class="text-btn" data-action="add-cc" data-vision-id="' +
          esc(v.id) +
          '">' +
          esc(t("pcAddCc")) +
          '</button><button type="button" class="text-btn danger" data-action="del-vision" data-vision-id="' +
          esc(v.id) +
          '">' +
          esc(t("pcDelete")) +
          "</button></div></div>" +
          "<p class=\"pc-vision-hint pc-muted\">" +
          esc(hint) +
          '</p><div class="pc-cclist">' +
          emptyCcHint +
          ccs +
          "</div></div>"
        );
      })
      .join("");

    var noVision =
      !config.visions || !config.visions.length
        ? '<p class="pc-tree-empty-hint pc-muted">' + esc(t("pcEmptyVisions")) + "</p>"
        : "";
    return (
      '<div class="pc-col-head">' +
      "<h2 class=\"pc-sec-h\">" +
      esc(t("pcColTree")) +
      "</h2>" +
      "<button type=\"button\" class=\"btn btn-primary btn-sm\" id=\"btn-add-vision\">" +
      esc(t("pcAddVision")) +
      "</button></div>" +
      "<div class=\"pc-tree-forest\">" +
      noVision +
      (vBlocks || "") +
      "</div>"
    );
  }

  function buildRightColumn() {
    var v = selectedVision();
    var cc = selectedCc();
    var pathBlock;
    if (v && cc) {
      pathBlock = '<p class="pc-cur-path"><strong>' + esc(v.name) + "</strong> <span>·</span> <strong>" + esc(cc.name) + "</strong></p>";
    } else {
      pathBlock = "<p class=\"pc-cur-path pc-muted\">—</p>";
    }
    return (
      '<div class="pc-col-top">' +
      "<h2 class=\"pc-sec-h\">" +
      esc(t("pcColDefects")) +
      "</h2>" +
      "<p class=\"pc-sec-dim\">" +
      esc(t("pcDefectsHint")) +
      "</p></div>" +
      buildFeatureListHtml() +
      '<div class="pc-bind-panel"><h3 class="pc-subh pc-subh--bind">' +
      esc(t("pcBindPanelTitle")) +
      "</h3>" +
      pathBlock +
      "<p class=\"pc-clip-dim small\">" +
      esc(t("pcLabelBind")) +
      ':</p><div class="pc-chk-list pc-chk-list--bind">' +
      buildCheckboxesForSelected() +
      "</div></div>"
    );
  }

  function buildTreeHtml() {
    return (
      '<div id="pc-workspace" class="pc-workspace"><div class="pc-col-left">' +
      buildLeftColumn() +
      "</div><div class=\"pc-col-right\">" +
      buildRightColumn() +
      "</div></div>"
    );
  }

  function renderAll() {
    ensureSelection();

    var box = $("pc-page-inner");
    if (!box) return;
    box.innerHTML = buildTreeHtml();
    if (TI) TI.refreshAll();
    if (document.body) document.body.setAttribute("data-i18n-doc", "docTitleProjectConfig");
  }

  function deploy() {
    var cfg = normalize(clone(config));
    var json;
    try {
      json = JSON.stringify(cfg);
      localStorage.setItem(LS_DEPLOYED, json);
      localStorage.setItem(LS_DRAFT, json);
      localStorage.setItem(LS_DEPLOY_TS, String(Date.now()));
    } catch (e) {
      alert("Deploy failed: " + e);
      return;
    }
    try {
      alert(t("pcDeploySuccess"));
    } catch (e) {}
    window.dispatchEvent(
      new CustomEvent("threshold:projectConfigDeployed", { detail: { at: localStorage.getItem(LS_DEPLOY_TS) } })
    );
  }

  function onTreeChange(e) {
    var tEl = e.target;
    if (!tEl) return;
    if (tEl.hasAttribute("data-vision-name")) {
      var vid0 = tEl.getAttribute("data-vision-id");
      var v0 = findVisionById(vid0);
      if (v0) v0.name = tEl.value || "未命名";
      saveDraft();
      return;
    }
    if (tEl.hasAttribute("data-vision-repeat")) {
      var vid1 = tEl.getAttribute("data-vision-id");
      var v1 = findVisionById(vid1);
      if (v1) {
        v1.repeat = Math.max(1, parseInt(tEl.value, 10) || 1);
        tEl.value = String(v1.repeat);
      }
      saveDraft();
      if (e.type === "change" || e.type === "input") {
        var rootN = tEl.closest(".pc-vision-blk");
        if (rootN && v1) {
          var hintP = rootN.querySelector(".pc-vision-hint");
          if (hintP) {
            var nImg2 = countImages(v1);
            var ncc2 = v1.ccs.length;
            var r2 = v1.repeat;
            var h = t("pcImageHint");
            if (typeof h === "string") {
              h = h.replace("{n}", String(nImg2)).replace("{cc}", String(ncc2)).replace("{r}", String(r2));
            }
            hintP.textContent = h;
          }
        }
      }
      return;
    }
  }

  function onTreeInput(e) {
    onTreeChange(e);
  }

  function onTreeInputFeature(e) {
    if (e.target.getAttribute("data-feature-name") !== null) {
      var fid = e.target.getAttribute("data-feature-name");
      var f = config.features.find(function (x) {
        return x.id === fid;
      });
      if (f) f.name = e.target.value || fid;
      saveDraft();
    }
  }

  function onClickTree(e) {
    var addVis = e.target && e.target.closest && e.target.closest("#btn-add-vision");
    if (addVis) {
      var nv = { id: uid("vision"), name: "新视野", repeat: 1, ccs: [{ id: uid("cc"), name: "CC1", featureIds: [] }] };
      config.visions.push(nv);
      selectedVisionId = nv.id;
      selectedCcId = nv.ccs[0].id;
      saveDraft();
      renderAll();
      return;
    }
    var addFt = e.target && e.target.closest && e.target.closest("#btn-add-feature");
    if (addFt) {
      var exists2 = function (id) {
        return config.features.some(function (f) {
          return f.id === id;
        });
      };
      var k0 = 1;
      var nid0;
      do {
        nid0 = "f" + k0;
        k0 += 1;
      } while (exists2(nid0) && k0 < 1e4);
      var b = 1;
      var nm0;
      do {
        nm0 = t("pcDefNewFeat") + b;
        b += 1;
      } while (config.features.some(function (x) { return x.name === nm0; }) && b < 1e4);
      if (b >= 1e4) nm0 = t("pcDefNewFeat");
      config.features.push({ id: nid0, name: nm0, icon: "neg", configured: true });
      saveDraft();
      renderAll();
      return;
    }
    var btn = e.target && e.target.closest && e.target.closest("button");
    if (btn) {
      var a = btn.getAttribute("data-action");
      if (a) {
        if (a === "del-vision") {
          var dvid = btn.getAttribute("data-vision-id");
          config.visions = config.visions.filter(function (v) {
            return v.id !== dvid;
          });
          if (!config.visions.length) {
            selectedVisionId = "";
            selectedCcId = "";
            try {
              alert(t("pcAlertAddVision"));
            } catch (e) {}
          } else {
            ensureSelection();
          }
          saveDraft();
          renderAll();
          return;
        }
        if (a === "add-cc") {
          var adVid = btn.getAttribute("data-vision-id");
          var vv = findVisionById(adVid);
          if (vv) {
            var ncc0 = { id: uid("cc"), name: "新CC", featureIds: [] };
            vv.ccs.push(ncc0);
            selectedVisionId = adVid;
            selectedCcId = ncc0.id;
          }
          saveDraft();
          renderAll();
          return;
        }
        if (a === "del-cc") {
          var sVid = btn.getAttribute("data-vision-id");
          var sCid = btn.getAttribute("data-cc-id");
          var vx = findVisionById(sVid);
          if (vx) {
            vx.ccs = vx.ccs.filter(function (c) {
              return c.id !== sCid;
            });
            if (!vx.ccs.length) {
              selectedVisionId = sVid;
              selectedCcId = "";
              try {
                alert(t("pcAlertAddCc"));
              } catch (e) {}
            } else {
              selectedVisionId = sVid;
              selectedCcId = vx.ccs[0] ? vx.ccs[0].id : "";
            }
          }
          saveDraft();
          renderAll();
          return;
        }
        if (a === "del-feat") {
          var dfid = btn.getAttribute("data-fid");
          if (!dfid) return;
          if (!window.confirm) return;
          if (!window.confirm(t("pcDeleteFeatureConfirm"))) return;
          config.features = config.features.filter(function (f) {
            return f.id !== dfid;
          });
          config.visions.forEach(function (vv) {
            vv.ccs.forEach(function (c) {
              c.featureIds = c.featureIds.filter(function (x) {
                return x !== dfid;
              });
            });
          });
          if (!config.features.length) {
            try {
              alert(t("pcAlertAddFeature"));
            } catch (e) {}
          }
          saveDraft();
          renderAll();
          return;
        }
        return;
      }
    }
    var row = e.target && e.target.closest && e.target.closest(".pc-sel-cc");
    if (row && e.target) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      var inBtn2 = e.target.closest && e.target.closest("button");
      if (inBtn2) return;
      var sv2 = row.getAttribute("data-sel-v");
      var sc2 = row.getAttribute("data-sel-c");
      if (sv2 && sc2 && (sv2 !== selectedVisionId || sc2 !== selectedCcId)) {
        selectedVisionId = sv2;
        selectedCcId = sc2;
        renderAll();
      }
    }
  }

  function onTreeChangeCb(e) {
    var tEl2 = e.target;
    if (!tEl2.getAttribute) return;
    if (tEl2.getAttribute("data-cc-id") && tEl2.getAttribute("data-vision-id") && tEl2.getAttribute("data-fid") !== null) {
      if (tEl2.type !== "checkbox") return;
      var vid2 = tEl2.getAttribute("data-vision-id");
      var cid2 = tEl2.getAttribute("data-cc-id");
      var fid2 = tEl2.getAttribute("data-fid");
      var v2 = findVisionById(vid2);
      var cc2 = v2 && findCc(v2, cid2);
      if (!cc2) return;
      if (tEl2.checked) {
        if (cc2.featureIds.indexOf(fid2) < 0) cc2.featureIds.push(fid2);
      } else {
        cc2.featureIds = cc2.featureIds.filter(function (x) {
          return x !== fid2;
        });
      }
      saveDraft();
    }
  }

  function onCcNameInput(e) {
    if (!e.target || !e.target.hasAttribute("data-cc-name")) return;
    var vid3 = e.target.getAttribute("data-vision-id");
    var cid3 = e.target.getAttribute("data-cc-id");
    var v3 = findVisionById(vid3);
    var cc3 = v3 && findCc(v3, cid3);
    if (cc3) cc3.name = e.target.value || "未命名";
    saveDraft();
  }

  function onPageInput(e) {
    onTreeInput(e);
    onTreeInputFeature(e);
    onCcNameInput(e);
  }

  function onPageClick(e) {
    onClickTree(e);
  }

  function onPageChange(e) {
    onTreeChange(e);
    onTreeChangeCb(e);
  }

  function init() {
    if (TI) {
      TI.wireLangButton();
      document.addEventListener("threshold:locale", function () {
        renderAll();
      });
    }
    var pageInner = $("pc-page-inner");
    if (pageInner) {
      pageInner.addEventListener("input", onPageInput, false);
      pageInner.addEventListener("change", onPageChange, false);
      pageInner.addEventListener("click", onPageClick, false);
    }
    $("btn-deploy").addEventListener("click", function () {
      deploy();
    });
    $("btn-reset-default").addEventListener("click", function () {
      if (!window.confirm || !window.confirm(t("pcResetConfirm"))) return;
      config = normalize(clone(EMPTY_PROJECT_CONFIG));
      selectedVisionId = config.visions[0] ? config.visions[0].id : "";
      selectedCcId = config.visions[0] && config.visions[0].ccs[0] ? config.visions[0].ccs[0].id : "";
      saveDraft();
      renderAll();
    });
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
