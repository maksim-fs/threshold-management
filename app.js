(function () {
  "use strict";

  const ATTRS = [
    { value: "mr_length", label: "MR Length" },
    { value: "mr_width", label: "MR Width" },
    { value: "v_height", label: "V Height" },
    { value: "h_width", label: "H Width" },
    { value: "area", label: "Area" },
    { value: "x", label: "X" },
    { value: "y", label: "Y" },
  ];

  const OPS = [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "between", label: "介于" },
  ];

  const RESULT_VALS = ["ng", "limit", "not_detected_ng"];

  const TI = window.ThresholdI18n;
  if (!TI) {
    throw new Error("i18n.js must load before app.js");
  }
  function t(k) {
    return TI.t(k);
  }
  function getLang() {
    return TI.getLang();
  }
  function setLang(l) {
    return TI.setLang(l);
  }

  function postIndexI18n() {
    if (!document.getElementById("filter-vision")) return;
    const kVis = document.querySelector("#cascade-filter [data-i18n=\"filterLabelVision\"]");
    if (kVis) kVis.textContent = t("filterLabelVision");
    const kCc = document.querySelector("#cascade-filter [data-i18n=\"filterLabelCc\"]");
    if (kCc) kCc.textContent = t("filterLabelCc");
    const kIm = document.querySelector("#cascade-filter [data-i18n=\"filterLabelImage\"]");
    if (kIm) kIm.textContent = t("filterLabelImage");
    rebuildCascadeFilters();
    const fstat = document.getElementById("filter-status");
    if (fstat) {
      if (fstat.options[0]) fstat.options[0].textContent = t("filterAllStatus");
      if (fstat.options[1]) fstat.options[1].textContent = t("stEnabled");
      if (fstat.options[2]) fstat.options[2].textContent = t("stDisabled");
    }
    const sby = document.getElementById("sort-by");
    if (sby && sby.options[0]) sby.options[0].textContent = t("sortByCreated");
    const sdr = document.getElementById("sort-dir");
    if (sdr) {
      if (sdr.options[0]) sdr.options[0].textContent = t("sortDesc");
      if (sdr.options[1]) sdr.options[1].textContent = t("sortAsc");
    }
    const fsearch = document.getElementById("feature-search");
    if (fsearch) fsearch.setAttribute("placeholder", t("searchPlaceholder"));
  }

  function applyPageI18n() {
    TI.refreshAll();
    postIndexI18n();
  }

  function attrT(value) {
    return t("attr_" + value);
  }

  function resLabelByValue(v) {
    if (v === "not_detected_ng") return t("res_notdet");
    if (v === "limit") return t("res_limit");
    return t("res_ng");
  }

  function opLabelValue(op) {
    if (op === "between") return t("op_between");
    if (op === "gte") return "≥";
    if (op === "lte") return "≤";
    return op;
  }

  const LS_PROJECT_CONFIG = "threshold_project_config_v1";
  const LS_PROJECT_DEPLOY_TS = "threshold_project_config_deploy_ts";
  const LS_THRESHOLD_STORE = "threshold_rules_store_v1";
  function cloneJson(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function safeId(raw, fallback) {
    const s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return s || fallback;
  }
  function normalizeProjectConfig(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const cfg = {
      visions: Array.isArray(src.visions) ? src.visions : [],
      features: Array.isArray(src.features) ? src.features : [],
    };
    /* 允许空项目；不自动用默认项补齐 */
    cfg.visions = cfg.visions
      .map(function (v, vi) {
        const repeat = Math.max(1, parseInt(v.repeat, 10) || 1);
        const ccs = Array.isArray(v.ccs) && v.ccs.length ? v.ccs : [];
        return {
          id: safeId(v.id, "vision_" + (vi + 1)),
          name: String(v.name || ("视野_" + (vi + 1))),
          repeat: repeat,
          ccs: ccs.map(function (cc, ci) {
            return {
              id: safeId(cc.id, "cc_" + (ci + 1)),
              name: String(cc.name || ("CC_" + (ci + 1))),
              featureIds: Array.isArray(cc.featureIds) ? cc.featureIds.map(String) : [],
            };
          }),
        };
      })
      .filter(function (v) {
        return v.name;
      });
    const configuredSet = new Set();
    cfg.visions.forEach(function (v) {
      v.ccs.forEach(function (cc) {
        cc.featureIds.forEach(function (fid) {
          configuredSet.add(String(fid));
        });
      });
    });
    cfg.features = cfg.features.map(function (f, i) {
      const fid = safeId(f.id, "feature_" + (i + 1));
      return {
        id: fid,
        name: String(f.name || f.id || ("Feature_" + (i + 1))),
        icon: f.icon === "ok" ? "ok" : "neg",
        // 阈值页面使用项目配置里“CC 绑定了哪些 feature”作为已配置依据
        configured: configuredSet.has(fid),
      };
    });
    return cfg;
  }
  function loadProjectConfig() {
    try {
      const raw = localStorage.getItem(LS_PROJECT_CONFIG);
      if (!raw) return normalizeProjectConfig({ visions: [], features: [] });
      return normalizeProjectConfig(JSON.parse(raw));
    } catch (e) {
      return normalizeProjectConfig({ visions: [], features: [] });
    }
  }
  const PROJECT_CONFIG = loadProjectConfig();
  const FOVS = PROJECT_CONFIG.visions.map(function (v) {
    return v.name;
  });
  const ROI_TARGETS = ["注液孔ROI", "蓝膜ROI", "顶盖二维码ROI"];

  function buildImageCatalog() {
    const list = [];
    let seq = 1;
    PROJECT_CONFIG.visions.forEach(function (vision, fi) {
      const repeat = Math.max(1, parseInt(vision.repeat, 10) || 1);
      const ccs = Array.isArray(vision.ccs) && vision.ccs.length ? vision.ccs : [];
      ccs.forEach(function (cc, ci) {
        for (let ii = 1; ii <= repeat; ii++) {
          const sn = "SN" + String(100000 + fi * 1000 + ci * 100 + ii);
          const hh = String(8 + fi).padStart(2, "0");
          const mm = String(10 + ci * 10 + ii).padStart(2, "0");
          const ss = String((fi + ci + ii) % 60).padStart(2, "0");
          const imageId = sn + "_20260420T" + hh + mm + ss;
          list.push({
            imageId: imageId,
            fov: vision.name,
            ccId: cc.id,
            ccZh: cc.name,
            ccEn: cc.name,
            imageNo: ii,
            sortKey: seq++,
          });
        }
      });
    });
    return list;
  }

  const IMAGE_CATALOG = buildImageCatalog();
  const IMAGE_BY_ID = {};
  IMAGE_CATALOG.forEach(function (it) {
    IMAGE_BY_ID[it.imageId] = it;
  });

  /** 项目配置：某视野下是否有 CC 绑定了该缺陷 */
  function visionHasFeature(vision, featureId) {
    const fid = String(featureId || "");
    if (!fid) return false;
    const ccs = vision.ccs || [];
    for (let i = 0; i < ccs.length; i++) {
      const ids = ccs[i].featureIds || [];
      for (let j = 0; j < ids.length; j++) {
        if (String(ids[j]) === fid) return true;
      }
    }
    return false;
  }

  /** 当前缺陷可配置阈值的视野名称列表（与项目配置 CC 绑定一致） */
  function getFovsForFeature(featureId) {
    const fid = String(featureId || "");
    if (!fid) return FOVS.slice();
    return PROJECT_CONFIG.visions
      .filter(function (v) {
        return visionHasFeature(v, fid);
      })
      .map(function (v) {
        return v.name;
      });
  }

  /** 当前缺陷可配置阈值的图像列表（仅含绑定该缺陷的 视野+CC 所生成的图） */
  function getImagesForFeature(featureId) {
    const fid = String(featureId || "");
    if (!fid) return IMAGE_CATALOG.slice();
    return IMAGE_CATALOG.filter(function (img) {
      const v = PROJECT_CONFIG.visions.find(function (vis) {
        return vis.name === img.fov;
      });
      if (!v) return false;
      const cc = (v.ccs || []).find(function (c) {
        return c.id === img.ccId;
      });
      if (!cc || !cc.featureIds) return false;
      return cc.featureIds.some(function (id) {
        return String(id) === fid;
      });
    });
  }

  function makeCcSlotKey(visionId, ccId) {
    return String(visionId || "") + "::" + String(ccId || "");
  }

  function parseCcSlotKey(key) {
    const s = String(key || "");
    const i = s.indexOf("::");
    if (i < 0) return null;
    return { visionId: s.slice(0, i), ccId: s.slice(i + 2) };
  }

  function findCcSlotByKey(key) {
    const p = parseCcSlotKey(key);
    if (!p || !p.visionId || !p.ccId) return null;
    const v = PROJECT_CONFIG.visions.find(function (x) {
      return x.id === p.visionId;
    });
    if (!v) return null;
    const cc = (v.ccs || []).find(function (c) {
      return c.id === p.ccId;
    });
    if (!cc) return null;
    return {
      key: makeCcSlotKey(v.id, cc.id),
      visionId: v.id,
      visionName: v.name,
      ccId: cc.id,
      ccName: cc.name,
    };
  }

  /** 当前缺陷可配置阈值的 视野+CC 槽位（仅含 CC 上绑定了该缺陷的项） */
  function getCcSlotsForFeature(featureId) {
    const fid = String(featureId || "");
    const out = [];
    PROJECT_CONFIG.visions.forEach(function (v) {
      (v.ccs || []).forEach(function (cc) {
        const bound =
          !fid ||
          (cc.featureIds || []).some(function (id) {
            return String(id) === fid;
          });
        if (bound) {
          out.push({
            key: makeCcSlotKey(v.id, cc.id),
            visionId: v.id,
            visionName: v.name,
            ccId: cc.id,
            ccName: cc.name,
          });
        }
      });
    });
    return out;
  }

  function ccSlotDisplayLabel(slot) {
    if (!slot) return "";
    return targetDisplayName(slot.visionName) + " / " + String(slot.ccName || "");
  }

  function ccSlotDisplayLabelFromKey(key) {
    const s = findCcSlotByKey(key);
    return s ? ccSlotDisplayLabel(s) : String(key || "");
  }

  function defaultImageForFov(fovName) {
    const hit = IMAGE_CATALOG.find(function (it) {
      return it.fov === fovName;
    });
    if (hit) return hit;
    if (IMAGE_CATALOG.length) return IMAGE_CATALOG[0];
    return { imageId: "", fov: "", ccId: "", ccZh: "", ccEn: "", imageNo: 0, sortKey: 0 };
  }

  function imageDisplayNameById(imageId) {
    const img = IMAGE_BY_ID[imageId];
    if (!img) return imageId;
    const fovPart = targetDisplayName(img.fov);
    if (getLang() === "en") {
      return fovPart + " / " + img.ccEn + " / Image " + img.imageNo;
    }
    return fovPart + " / " + img.ccZh + " / 图像" + img.imageNo;
  }

  function targetDisplayName(internal) {
    return TI.targetDisplayName(internal);
  }

  const VISION_ROI_PREFIX = "roi:";

  function getCcSlotsUnderVision(visionName, featureId) {
    return getCcSlotsForFeature(featureId).filter(function (s) {
      return s.visionName === visionName;
    });
  }

  function parseVisionFilterValue(v) {
    if (!v) return { kind: "all" };
    if (v.indexOf(VISION_ROI_PREFIX) === 0) {
      return { kind: "roi", name: v.slice(VISION_ROI_PREFIX.length) };
    }
    return { kind: "fov", name: v };
  }

  function rebuildVisionSelect() {
    const sel = document.getElementById("filter-vision");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = t("filterCascadeAll");
    sel.appendChild(o0);
    const fid = activeFeatureId || "";
    getFovsForFeature(fid).forEach(function (fov) {
      const o = document.createElement("option");
      o.value = fov;
      o.textContent = targetDisplayName(fov);
      sel.appendChild(o);
    });
    if (ROI_TARGETS.length) {
      const sep = document.createElement("option");
      sep.disabled = true;
      sep.value = "";
      sep.textContent = t("filterCascadeSepRoi");
      sel.appendChild(sep);
      ROI_TARGETS.forEach(function (rn) {
        const o2 = document.createElement("option");
        o2.value = VISION_ROI_PREFIX + rn;
        o2.textContent = targetDisplayName(rn) + (getLang() === "en" ? " (ROI)" : " (ROI)");
        sel.appendChild(o2);
      });
    }
    var j;
    var hasV = false;
    for (j = 0; j < sel.options.length; j++) {
      if (sel.options[j].value === prev) {
        hasV = true;
        break;
      }
    }
    sel.value = hasV ? prev : "";
  }

  function rebuildCcSelect() {
    const cSel = document.getElementById("filter-cc");
    const vSel = document.getElementById("filter-vision");
    if (!cSel || !vSel) return;
    const prevC = cSel.value;
    const pv = parseVisionFilterValue(vSel.value);
    cSel.innerHTML = "";
    const c0 = document.createElement("option");
    c0.value = "";
    c0.textContent = t("filterAllUnderCcInVision");
    cSel.appendChild(c0);
    cSel.disabled = !vSel.value || pv.kind !== "fov" || !pv.name;
    if (pv.kind === "fov" && pv.name) {
      getCcSlotsUnderVision(pv.name, activeFeatureId).forEach(function (s) {
        const o = document.createElement("option");
        o.value = s.key;
        o.textContent = s.ccName || s.key;
        cSel.appendChild(o);
      });
    }
    if (cSel.disabled) {
      cSel.value = "";
    } else {
      var hasC = false;
      for (var jc = 0; jc < cSel.options.length; jc++) {
        if (cSel.options[jc].value === prevC) {
          hasC = true;
          break;
        }
      }
      cSel.value = hasC ? prevC : "";
    }
  }

  function rebuildImageSelect() {
    const iSel = document.getElementById("filter-image");
    const vSel = document.getElementById("filter-vision");
    const cSel = document.getElementById("filter-cc");
    if (!iSel || !vSel || !cSel) return;
    const prevI = iSel.value;
    const vStr = vSel.value;
    const cStr = cSel.value;
    const pv = parseVisionFilterValue(vStr);
    iSel.innerHTML = "";
    if (!vStr || pv.kind !== "fov" || !pv.name) {
      iSel.disabled = true;
      const o = document.createElement("option");
      o.value = "";
      o.textContent = t("filterCascadeImageNeedVision");
      iSel.appendChild(o);
      iSel.value = "";
      return;
    }
    iSel.disabled = false;
    const o0i = document.createElement("option");
    o0i.value = "";
    o0i.textContent = cStr ? t("filterAllUnderImageInCc") : t("filterAllUnderImageInVision");
    iSel.appendChild(o0i);
    const fid2 = activeFeatureId || "";
    if (cStr) {
      const sl = findCcSlotByKey(cStr);
      if (sl) {
        getImagesForFeature(fid2)
          .filter(function (im) {
            return im.fov === sl.visionName && im.ccId === sl.ccId;
          })
          .forEach(function (im) {
            const oi = document.createElement("option");
            oi.value = im.imageId;
            oi.textContent = imageDisplayNameById(im.imageId);
            iSel.appendChild(oi);
          });
      }
    } else {
      getImagesForFeature(fid2)
        .filter(function (im) {
          return im.fov === pv.name;
        })
        .forEach(function (im) {
          const oi2 = document.createElement("option");
          oi2.value = im.imageId;
          oi2.textContent = imageDisplayNameById(im.imageId);
          iSel.appendChild(oi2);
        });
    }
    var hasI = false;
    for (var ji = 0; ji < iSel.options.length; ji++) {
      if (iSel.options[ji].value === prevI) {
        hasI = true;
        break;
      }
    }
    iSel.value = hasI ? prevI : "";
  }

  function rebuildCascadeFilters() {
    rebuildVisionSelect();
    rebuildCcSelect();
    rebuildImageSelect();
  }

  /** 与「像素/毫米」工具共用，毫米转化记录 */
  const LS_PXMM_RECORDS = "pxmm_convert_records_v1";

  const FEATURES = PROJECT_CONFIG.features.map(function (f) {
    return {
      id: f.id,
      name: f.name,
      icon: f.icon === "ok" ? "ok" : "neg",
      configured: f.configured !== false,
    };
  });

  let ruleIdSeq = 100;

  function emptyCond() {
    return { attr: "area", op: "gte", v1: "", v2: "" };
  }

  /** 「未检出时判 NG」下条件不参与判定，全部留空且不可编辑 */
  function blankCond() {
    return { attr: "", op: "", v1: "", v2: "" };
  }

  function isRoiTarget(name) {
    return ROI_TARGETS.includes(name);
  }

  function getRuleTargetName(rule) {
    if (rule.targetType === "roi" || isRoiTarget(rule.targetName || rule.fov || "")) {
      return rule.targetName || rule.fov || ROI_TARGETS[0];
    }
    if (rule.targetType === "fov") {
      return rule.targetName || rule.fov || FOVS[0] || "";
    }
    if (rule.targetType === "cc" || (!rule.targetType && parseCcSlotKey(rule.targetName || ""))) {
      if (rule.targetName) return rule.targetName;
      const v = PROJECT_CONFIG.visions.find(function (x) {
        return x.name === rule.fov;
      });
      if (v && rule.ccId) return makeCcSlotKey(v.id, rule.ccId);
      return "";
    }
    if (rule.targetType === "image" || rule.imageId) {
      if (rule.imageId) return rule.imageId;
    }
    const baseF = rule.targetName || rule.fov || (FOVS[0] || "");
    const legacy = defaultImageForFov(baseF);
    return (legacy && legacy.imageId) || (IMAGE_CATALOG[0] && IMAGE_CATALOG[0].imageId) || "";
  }

  function getRuleTargetType(rule) {
    if (rule.targetType === "roi") return "roi";
    if (rule.targetType === "cc") return "cc";
    if (rule.targetType === "fov") return "fov";
    if (rule.targetType === "image") return "image";
    if (isRoiTarget(rule.targetName || rule.fov || "")) return "roi";
    if (!rule.targetType && parseCcSlotKey(rule.targetName || "")) return "cc";
    if (rule.imageId) return "image";
    return "fov";
  }

  function getRuleVisionForMm(rule) {
    if (getRuleTargetType(rule) === "roi") return "";
    if (getRuleTargetType(rule) === "fov") return getRuleTargetName(rule);
    if (getRuleTargetType(rule) === "cc") return rule.fov || "";
    const img = IMAGE_BY_ID[getRuleTargetName(rule)];
    return img ? img.fov : "";
  }

  function makeRule(partial) {
    const result = partial.result || "ng";
    const nd = result === "not_detected_ng";
    if (partial.targetType === "fov") {
      const fovName = partial.targetName || partial.fov || FOVS[0] || "";
      return {
        id: "r" + ++ruleIdSeq,
        createdAt: partial.createdAt != null ? partial.createdAt : Date.now(),
        targetName: fovName,
        targetType: "fov",
        imageId: "",
        fov: fovName,
        ccId: "",
        result: result,
        status: partial.status || "enabled",
        c1: nd ? blankCond() : partial.c1 ? { ...partial.c1 } : emptyCond(),
        c2: nd ? blankCond() : partial.c2 ? { ...partial.c2 } : emptyCond(),
      };
    }
    if (partial.targetType === "cc") {
      const key = partial.ccSlotKey || partial.targetName || "";
      const slot = key ? findCcSlotByKey(key) : null;
      const vision = slot
        ? PROJECT_CONFIG.visions.find(function (x) {
            return x.id === slot.visionId;
          })
        : null;
      const fovName = vision ? vision.name : partial.fov || "";
      const ccId = slot ? slot.ccId : partial.ccId || "";
      const targetName = slot ? slot.key : key;
      return {
        id: "r" + ++ruleIdSeq,
        createdAt: partial.createdAt != null ? partial.createdAt : Date.now(),
        targetName: targetName,
        targetType: "cc",
        imageId: "",
        fov: fovName,
        ccId: ccId,
        result: result,
        status: partial.status || "enabled",
        c1: nd ? blankCond() : partial.c1 ? { ...partial.c1 } : emptyCond(),
        c2: nd ? blankCond() : partial.c2 ? { ...partial.c2 } : emptyCond(),
      };
    }
    const maybeTarget = partial.targetName || partial.fov || "";
    const isRoi = partial.targetType === "roi" || isRoiTarget(maybeTarget);
    const resolvedImage =
      !isRoi
        ? partial.imageId && IMAGE_BY_ID[partial.imageId]
          ? IMAGE_BY_ID[partial.imageId]
          : defaultImageForFov(maybeTarget || (FOVS[0] || ""))
        : null;
    return {
      id: "r" + ++ruleIdSeq,
      createdAt: partial.createdAt != null ? partial.createdAt : Date.now(),
      targetName: isRoi ? maybeTarget : resolvedImage.imageId,
      targetType: isRoi ? "roi" : "image",
      imageId: isRoi ? "" : resolvedImage.imageId,
      fov: isRoi ? "" : resolvedImage.fov,
      ccId: isRoi ? "" : resolvedImage.ccId,
      result: result,
      status: partial.status || "enabled",
      c1: nd ? blankCond() : partial.c1 ? { ...partial.c1 } : emptyCond(),
      c2: nd ? blankCond() : partial.c2 ? { ...partial.c2 } : emptyCond(),
    };
  }

  function loadThresholdStoreRaw() {
    try {
      const raw = localStorage.getItem(LS_THRESHOLD_STORE);
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) {
      return {};
    }
  }

  function persistThresholdStore() {
    try {
      const out = {};
      FEATURES.forEach(function (f) {
        out[f.id] = store[f.id] || [];
      });
      localStorage.setItem(LS_THRESHOLD_STORE, JSON.stringify(out));
    } catch (e) {}
  }

  function syncRuleIdSeqFromStore() {
    let max = ruleIdSeq;
    Object.keys(store).forEach(function (k) {
      (store[k] || []).forEach(function (r) {
        const m = String(r.id || "").match(/^r(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
    });
    ruleIdSeq = max;
  }

  const store = {};
  FEATURES.forEach(function (f) {
    store[f.id] = [];
  });
  (function hydrateThresholdStore() {
    const loaded = loadThresholdStoreRaw();
    FEATURES.forEach(function (f) {
      const arr = loaded[f.id];
      store[f.id] = Array.isArray(arr) ? arr : [];
    });
  })();
  syncRuleIdSeqFromStore();

  let activeFeatureId = (FEATURES[0] || { id: "" }).id;

  function $(sel) {
    return document.querySelector(sel);
  }

  function showToast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2200);
  }

  function isNotDetectedResult(val) {
    return val === "not_detected_ng";
  }

  function renderFeatureList(filter) {
    const q = (filter || "").trim().toLowerCase();
    const onlyUnconfigured = $("#toggle-unconfigured").checked;
    const ul = $("#feature-list");
    ul.innerHTML = "";
    const visibleFeatures = FEATURES.filter(function (f) {
      return onlyUnconfigured ? !f.configured : true;
    });
    if (!visibleFeatures.length) {
      activeFeatureId = "";
    } else if (
      !visibleFeatures.some(function (f) {
        return f.id === activeFeatureId;
      })
    ) {
      activeFeatureId = visibleFeatures[0].id;
    }
    visibleFeatures.forEach(function (f) {
      const tk = "feature_" + f.id;
      const tv = t(tk);
      /* 项目配置中的名称优先：避免 f2/f3 等 id 与 i18n 里 feature_f2 等 demo 键冲突，把用户起的「碰伤/褶皱」误显示成 Feature_2 */
      const disp =
        f.name && String(f.name).trim() ? f.name : tv === tk ? f.id : tv;
      const i18nZh = TI.I18N.zh[tk];
      const i18nEn = TI.I18N.en[tk];
      if (q) {
        const hay = [disp, f.id, i18nZh, i18nEn, tv]
          .filter(function (x) {
            return x != null && String(x).trim() !== "";
          })
          .map(function (x) {
            return String(x).toLowerCase();
          });
        if (!hay.some(function (h) {
          return h.indexOf(q) >= 0;
        })) {
          return;
        }
      }
      const li = document.createElement("li");
      li.className =
        "feature-item" +
        (f.id === activeFeatureId ? " is-active" : "") +
        (!f.configured ? " is-unbound" : "");
      li.dataset.id = f.id;
      const icon = f.icon === "ok" ? "✓" : "−";
      li.innerHTML =
        '<span class="feature-icon ' +
        (f.icon === "ok" ? "ok" : "neg") +
        '">' +
        icon +
        "</span><span>" +
        escapeHtml(disp) +
        "</span>";
      li.addEventListener("click", function () {
        activeFeatureId = f.id;
        renderFeatureList($("#feature-search").value);
        renderTable();
      });
      ul.appendChild(li);
    });
    rebuildCascadeFilters();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** 判定条件数值：单位像素，仅允许非负整数 */
  function sanitizePixelIntString(raw) {
    return String(raw).replace(/\D/g, "");
  }

  function unifiedTargetPack(kind, raw) {
    return (
      "u" +
      btoa(
        unescape(encodeURIComponent(JSON.stringify({ k: kind, p: String(raw) })))
      )
    );
  }
  function unifiedTargetParse(s) {
    if (!s || s.charAt(0) !== "u") return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(s.slice(1)))));
    } catch (e) {
      return null;
    }
  }
  function isUnifiedOptionSelected(rule, kind, raw) {
    const rt = getRuleTargetType(rule);
    if (kind === "fov") return rt === "fov" && (getRuleTargetName(rule) === raw || rule.fov === raw);
    if (kind === "cc") return rt === "cc" && getRuleTargetName(rule) === raw;
    if (kind === "img") {
      return rt === "image" && (rule.imageId || getRuleTargetName(rule)) === raw;
    }
    return false;
  }
  function applyRuleFromUnifiedPick(rule, o) {
    if (!o || !o.k) return;
    if (o.k === "fov") {
      rule.targetName = o.p;
      rule.targetType = "fov";
      rule.imageId = "";
      rule.fov = o.p;
      rule.ccId = "";
      return;
    }
    if (o.k === "cc") {
      const slot = findCcSlotByKey(o.p);
      if (!slot) return;
      const vision = PROJECT_CONFIG.visions.find(function (x) {
        return x.id === slot.visionId;
      });
      rule.targetName = slot.key;
      rule.targetType = "cc";
      rule.imageId = "";
      rule.fov = vision ? vision.name : slot.visionName;
      rule.ccId = slot.ccId;
      return;
    }
    if (o.k === "img") {
      const im = IMAGE_BY_ID[o.p];
      if (!im) return;
      rule.targetName = im.imageId;
      rule.targetType = "image";
      rule.imageId = im.imageId;
      rule.fov = im.fov;
      rule.ccId = im.ccId;
    }
  }
  /**
   * 单一下拉、分组展示：可任选 视野 / CC / 单张图，不再拆成「粒度+目标」两步，避免被理解成只能固定某一级。
   */
  function buildUnifiedTargetSelectHtml(rule, featureId) {
    const fid = featureId != null ? featureId : activeFeatureId;
    const parts = [];
    parts.push(
      "<select class=\"select unified-target-sel\" style=\"min-width:min(100%, 320px)\" title=\"" +
        escapeHtml(t("hintTargetDim")) +
        "\" aria-label=\"" +
        escapeHtml(t("thFovRoi")) +
        '">'
    );
    const fovs = getFovsForFeature(fid);
    const fovRows = fovs.slice();
    if (isUnifiedOptionSelected(rule, "fov", rule.fov) && rule.fov && fovRows.indexOf(rule.fov) < 0) {
      fovRows.unshift(rule.fov);
    }
    var hasAny = false;
    if (fovRows.length) {
      hasAny = true;
      parts.push(
        "<optgroup label=\"" + escapeHtml(t("filterGroupVision")) + '">'
      );
      fovRows.forEach(function (fov) {
        const val = unifiedTargetPack("fov", fov);
        const sel = isUnifiedOptionSelected(rule, "fov", fov) ? " selected" : "";
        parts.push(
          "<option value=\"" +
            escapeHtml(val) +
            '"' +
            sel +
            ">" +
            escapeHtml(targetDisplayName(fov)) +
            "</option>"
        );
      });
      parts.push("</optgroup>");
    }
    let slots = getCcSlotsForFeature(fid);
    const curCcKey = getRuleTargetType(rule) === "cc" ? getRuleTargetName(rule) : "";
    if (curCcKey && !slots.some(function (s) { return s.key === curCcKey; })) {
      const orphanC = findCcSlotByKey(curCcKey);
      if (orphanC) slots = [orphanC].concat(slots);
    }
    if (slots.length) {
      hasAny = true;
      parts.push("<optgroup label=\"" + escapeHtml(t("filterGroupCc")) + '">');
      slots.forEach(function (s) {
        const val = unifiedTargetPack("cc", s.key);
        const sel = isUnifiedOptionSelected(rule, "cc", s.key) ? " selected" : "";
        parts.push(
          "<option value=\"" +
            escapeHtml(val) +
            '"' +
            sel +
            ">" +
            escapeHtml(ccSlotDisplayLabel(s)) +
            "</option>"
        );
      });
      parts.push("</optgroup>");
    }
    let imgs = getImagesForFeature(fid);
    const curImg = getRuleTargetType(rule) === "image" ? rule.imageId || getRuleTargetName(rule) : "";
    if (curImg && !imgs.some(function (im) { return im.imageId === curImg; })) {
      const orphanI = IMAGE_BY_ID[curImg];
      if (orphanI) imgs = [orphanI].concat(imgs);
    }
    if (imgs.length) {
      hasAny = true;
      parts.push(
        "<optgroup label=\"" + escapeHtml(t("filterGroupImage")) + '">'
      );
      imgs.forEach(function (im) {
        const val = unifiedTargetPack("img", im.imageId);
        const sel = isUnifiedOptionSelected(rule, "img", im.imageId) ? " selected" : "";
        parts.push(
          "<option value=\"" +
            escapeHtml(val) +
            '"' +
            sel +
            ">" +
            escapeHtml(imageDisplayNameById(im.imageId)) +
            "</option>"
        );
      });
      parts.push("</optgroup>");
    }
    if (!hasAny) {
      parts.push(
        "<option value=\"\" disabled>" +
          escapeHtml(t("toastNoFeatureBinding")) +
          "</option>"
      );
    }
    parts.push("</select>");
    return parts.join("");
  }

  function loadPxMmConvertRecords() {
    try {
      const raw = localStorage.getItem(LS_PXMM_RECORDS);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  /** 统一视野名称便于匹配（如 CCD-1 与 CCD1、全半角空格） */
  function normalizeVisionKey(name) {
    return String(name || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, "")
      .replace(/CCD-(\d)/gi, "CCD$1")
      .toLowerCase();
  }

  function pickPxMmRecord(fov, kind) {
    const key = normalizeVisionKey(fov);
    const list = loadPxMmConvertRecords().filter(function (r) {
      return (
        r &&
        normalizeVisionKey(r.fov) === key &&
        Number(r.pxValue) > 0 &&
        Number(r.mmValue) > 0
      );
    });
    list.sort(function (a, b) {
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
    if (kind === "area") {
      return list.find(function (r) {
        return r.metric === "area";
      }) || null;
    }
    const lenM = ["mr_len", "mr_wid", "center_x", "center_y"];
    return list.find(function (r) {
      return lenM.indexOf(r.metric) >= 0;
    }) || null;
  }

  function attrUsesAreaPx2(attr) {
    return attr === "area";
  }

  /**
   * 同一视野下优先使用面积标定（用户常只配一条）；否则用长度类标定。
   * 面积标定给出 mm²/px²，线性尺寸用 √(mm²/px²) 作为 mm/px。
   */
  function pickConvertRecordForVision(fov) {
    return pickPxMmRecord(fov, "area") || pickPxMmRecord(fov, "length");
  }

  /** X/Y 像素坐标不参与毫米换算 */
  function attrSkipsMmConversion(attr) {
    return attr === "x" || attr === "y";
  }

  function fmtMmTwoDecimals(n) {
    if (n == null || !Number.isFinite(n)) return "";
    return n.toFixed(2);
  }

  /** 返回展示在像素值后的括号文案，无转化时返回空串 */
  function mmEquivHint(attr, pxDigitsStr, fovName) {
    if (!fovName || pxDigitsStr == null || String(pxDigitsStr).trim() === "") return "";
    if (attrSkipsMmConversion(attr)) return "";
    const digits = String(pxDigitsStr).replace(/\D/g, "");
    if (!digits) return "";
    const px = parseInt(digits, 10);
    if (!Number.isFinite(px) || px < 0) return "";
    const rec = pickConvertRecordForVision(fovName);
    if (!rec) return "";
    const pxCal = Number(rec.pxValue);
    const mmCal = Number(rec.mmValue);
    if (!(pxCal > 0) || !(mmCal > 0)) return "";
    if (rec.metric === "area") {
      const mm2PerPx2 = mmCal / pxCal;
      if (!(mm2PerPx2 > 0)) return "";
      const pOpen = getLang() === "en" ? " (≈ " : "（≈ ";
      if (attrUsesAreaPx2(attr)) {
        const mm2 = px * mm2PerPx2;
        return pOpen + fmtMmTwoDecimals(mm2) + (getLang() === "en" ? " mm²)" : " mm²）");
      }
      const mmPerPx = Math.sqrt(mm2PerPx2);
      const mmLin = px * mmPerPx;
      return pOpen + fmtMmTwoDecimals(mmLin) + (getLang() === "en" ? " mm)" : " mm）");
    }
    const pOpen2 = getLang() === "en" ? " (≈ " : "（≈ ";
    const mmPerPx = mmCal / pxCal;
    if (!(mmPerPx > 0)) return "";
    if (attrUsesAreaPx2(attr)) {
      const mm2 = px * mmPerPx * mmPerPx;
      return pOpen2 + fmtMmTwoDecimals(mm2) + (getLang() === "en" ? " mm²)" : " mm²）");
    }
    const mmLin = px * mmPerPx;
    return pOpen2 + fmtMmTwoDecimals(mmLin) + (getLang() === "en" ? " mm)" : " mm）");
  }

  function updateRowMmHints(tr, rule) {
    if (!tr || !rule) return;
    if (getRuleTargetType(rule) === "roi") return;
    if (isNotDetectedResult(rule.result)) return;
    const fov = getRuleVisionForMm(rule);
    tr.querySelectorAll(".cond-mm-hint").forEach(function (span) {
      const group = span.closest(".cond-group");
      if (!group || group.classList.contains("is-disabled")) return;
      const prefix = group.dataset.cond;
      const vf = span.getAttribute("data-val-for");
      if (!prefix || !vf) return;
      const cond = rule[prefix];
      if (!cond) return;
      span.textContent = mmEquivHint(cond.attr, cond[vf], fov);
    });
  }

  function renderTargetName(rule) {
    const name = getRuleTargetName(rule);
    const rt = getRuleTargetType(rule);
    const show =
      rt === "roi"
        ? targetDisplayName(name)
        : rt === "fov"
          ? targetDisplayName(name)
          : rt === "cc"
            ? ccSlotDisplayLabelFromKey(name)
            : imageDisplayNameById(name);
    if (getRuleTargetType(rule) === "roi") {
      return (
        '<span class="target-name">' +
        escapeHtml(show) +
        '<span class="target-badge">ROI</span></span>'
      );
    }
    return escapeHtml(show);
  }

  function renderCond(prefix, cond, disabled) {
    if (disabled) {
      const ndT = t("condNDTitle");
      return (
        '<div class="cond-group is-disabled" data-cond="' +
        prefix +
        '">' +
        '<select class="cond-select" disabled title="' +
        escapeHtml(ndT) +
        '">' +
        '<option value=""></option></select>' +
        '<select class="cond-select" disabled title="' +
        escapeHtml(ndT) +
        '">' +
        '<option value=""></option></select>' +
        '<input type="text" class="cond-input" disabled value="" title="' +
        escapeHtml(ndT) +
        '" />' +
        "</div>"
      );
    }

    const mmHint = function (field) {
      return '<span class="cond-mm-hint" data-val-for="' + field + '"></span>';
    };

    const between = cond.op === "between";
    const attrOpts = ATTRS.map(function (a) {
      return (
        '<option value="' +
        escapeHtml(a.value) +
        '"' +
        (a.value === cond.attr ? " selected" : "") +
        ">" +
        escapeHtml(attrT(a.value)) +
        "</option>"
      );
    }).join("");
    const opOpts = OPS.map(function (o) {
      return (
        '<option value="' +
        escapeHtml(o.value) +
        '"' +
        (o.value === cond.op ? " selected" : "") +
        ">" +
        escapeHtml(opLabelValue(o.value)) +
        "</option>"
      );
    }).join("");

    const tPt = t("phTitle");
    const valBlock = between
      ? '<span class="cond-between">' +
        '<span class="cond-val-inline">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="cond-input cond-input--narrow" data-field="v1" value="' +
        escapeHtml(cond.v1) +
        '" placeholder="' +
        escapeHtml(t("phLower")) +
        '" title="' +
        escapeHtml(tPt) +
        '" ' +
        (disabled ? "disabled" : "") +
        "/>" +
        mmHint("v1") +
        "</span>" +
        '<span class="cond-sep">~</span>' +
        '<span class="cond-val-inline">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="cond-input cond-input--narrow" data-field="v2" value="' +
        escapeHtml(cond.v2) +
        '" placeholder="' +
        escapeHtml(t("phUpper")) +
        '" title="' +
        escapeHtml(tPt) +
        '" ' +
        (disabled ? "disabled" : "") +
        "/>" +
        mmHint("v2") +
        "</span>" +
        "</span>"
      : '<span class="cond-val-inline">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="cond-input" data-field="v1" value="' +
        escapeHtml(cond.v1) +
        '" placeholder="' +
        escapeHtml(t("phPixel")) +
        '" title="' +
        escapeHtml(tPt) +
        '" ' +
        (disabled ? "disabled" : "") +
        "/>" +
        mmHint("v1") +
        "</span>";

    return (
      '<div class="cond-group' +
      (disabled ? " is-disabled" : "") +
      '" data-cond="' +
      prefix +
      '">' +
      '<select class="cond-select" data-field="attr" ' +
      (disabled ? "disabled" : "") +
      ">" +
      attrOpts +
      "</select>" +
      '<select class="cond-select" data-field="op" ' +
      (disabled ? "disabled" : "") +
      ">" +
      opOpts +
      "</select>" +
      valBlock +
      "</div>"
    );
  }

  function ruleMatchesTargetFilter(rule, filterVal) {
    if (!filterVal) return true;
    const tname = getRuleTargetName(rule);
    if (tname === filterVal) return true;
    if (ROI_TARGETS.indexOf(filterVal) >= 0) {
      return isRoiTarget(tname) && tname === filterVal;
    }
    if (IMAGE_BY_ID[filterVal]) {
      if (getRuleTargetType(rule) === "image") {
        const im = IMAGE_BY_ID[rule.imageId] || IMAGE_BY_ID[tname];
        return im && im.imageId === filterVal;
      }
      return false;
    }
    if (parseCcSlotKey(filterVal)) {
      if (getRuleTargetType(rule) === "cc" && tname === filterVal) return true;
      if (getRuleTargetType(rule) === "image") {
        const slotF = findCcSlotByKey(filterVal);
        if (!slotF) return false;
        const im2 = IMAGE_BY_ID[rule.imageId] || IMAGE_BY_ID[tname];
        if (!im2) return false;
        return im2.fov === slotF.visionName && im2.ccId === slotF.ccId;
      }
      return false;
    }
    const fovsF = getFovsForFeature(activeFeatureId);
    if (fovsF.indexOf(filterVal) >= 0) {
      if (getRuleTargetType(rule) === "fov" && (rule.fov === filterVal || tname === filterVal)) return true;
      if (getRuleTargetType(rule) === "cc") {
        const sl = findCcSlotByKey(tname);
        return sl && sl.visionName === filterVal;
      }
      if (getRuleTargetType(rule) === "image") {
        const im3 = IMAGE_BY_ID[rule.imageId] || IMAGE_BY_ID[tname];
        return im3 && im3.fov === filterVal;
      }
    }
    return false;
  }

  function ruleMatchesCascadeFilter(rule, vStr, cStr, iStr) {
    if (!vStr) return true;
    const tname = getRuleTargetName(rule);
    const rt = getRuleTargetType(rule);
    const pv = parseVisionFilterValue(vStr);
    if (pv.kind === "roi") {
      return rt === "roi" && tname === pv.name;
    }
    if (rt === "roi") return false;
    if (pv.kind !== "fov") return false;
    const visName = pv.name;
    if (!cStr) {
      if (!iStr) {
        return ruleMatchesTargetFilter(rule, visName);
      }
      const imF = IMAGE_BY_ID[iStr];
      if (!imF) return false;
      if (rt !== "image") return false;
      const rIm = IMAGE_BY_ID[rule.imageId] || IMAGE_BY_ID[tname];
      return rIm && rIm.imageId === iStr && rIm.fov === visName;
    }
    if (!iStr) {
      if (rt === "cc" && tname === cStr) return true;
      if (rt === "image") {
        const slotF = findCcSlotByKey(cStr);
        if (!slotF) return false;
        const im2 = IMAGE_BY_ID[rule.imageId] || IMAGE_BY_ID[tname];
        if (!im2) return false;
        return im2.fov === slotF.visionName && im2.ccId === slotF.ccId;
      }
      if (rt === "fov" && (rule.fov === visName || tname === visName)) {
        const sl0 = findCcSlotByKey(cStr);
        return sl0 && sl0.visionName === visName;
      }
      return false;
    }
    const im3 = IMAGE_BY_ID[iStr];
    if (!im3) return false;
    if (rt !== "image") return false;
    const rIm3 = IMAGE_BY_ID[rule.imageId] || IMAGE_BY_ID[tname];
    if (!rIm3 || rIm3.imageId !== iStr) return false;
    const sl2 = findCcSlotByKey(cStr);
    if (!sl2) return false;
    return rIm3.fov === sl2.visionName && rIm3.ccId === sl2.ccId;
  }

  function getRulesForDisplay() {
    const rows = (store[activeFeatureId] || []).filter(function (r) {
      const fVis = (document.getElementById("filter-vision") || {}).value || "";
      const fCc = (document.getElementById("filter-cc") || {}).value || "";
      const fIm = (document.getElementById("filter-image") || {}).value || "";
      const stF = $("#filter-status").value;
      if (fVis && !ruleMatchesCascadeFilter(r, fVis, fCc, fIm)) return false;
      if (stF && r.status !== stF) return false;
      return true;
    });
    const sortBy = $("#sort-by").value;
    const dirMul = $("#sort-dir").value === "asc" ? 1 : -1;
    rows.sort(function (a, b) {
      const aRoi = getRuleTargetType(a) === "roi" ? 1 : 0;
      const bRoi = getRuleTargetType(b) === "roi" ? 1 : 0;
      if (aRoi !== bRoi) return aRoi - bRoi;
      if (sortBy === "created") {
        return (a.createdAt - b.createdAt) * dirMul;
      }
      return 0;
    });
    return rows;
  }

  function renderTable() {
    const tbody = $("#rules-body");
    const rows = getRulesForDisplay();
    const allRows = store[activeFeatureId] || [];

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:24px;color:#909399;">' +
        escapeHtml(t("emptyNoData")) +
        (allRows.length ? escapeHtml(t("emptyHintFilter")) : escapeHtml(t("emptyHintAdd"))) +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = rows
      .map(function (rule, i) {
        const isRoi = getRuleTargetType(rule) === "roi";
        const notDet = isNotDetectedResult(rule.result);
        const condDisabled = notDet || isRoi;
        const resOpts = RESULT_VALS.map(function (v) {
          return (
            '<option value="' +
            escapeHtml(v) +
            '"' +
            (v === rule.result ? " selected" : "") +
            ">" +
            escapeHtml(resLabelByValue(v)) +
            "</option>"
          );
        }).join("");
        const targetCell = isRoi
          ? '<div class="target-wrap">' + renderTargetName(rule) + "</div>"
          : buildUnifiedTargetSelectHtml(rule, activeFeatureId);
        const actionCell = isRoi
          ? '<button type="button" class="text-btn btn-view">' + escapeHtml(t("btnView")) + "</button>"
          : '<button type="button" class="text-btn btn-edit">' +
            escapeHtml(t("btnEdit")) +
            '</button><button type="button" class="text-btn danger btn-del">' +
            escapeHtml(t("btnDelete")) +
            "</button>";

        return (
          "<tr data-rule-id=\"" +
          escapeHtml(rule.id) +
          '">' +
          '<td class="idx-cell">' +
          (i + 1) +
          "</td>" +
          "<td>" +
          targetCell +
          "</td>" +
          "<td><select class=\"select result-sel\" style=\"min-width:150px\" " +
          (isRoi ? "disabled" : "") +
          ">" +
          resOpts +
          "</select></td>" +
          '<td><select class="select status-sel" style="min-width:88px" ' +
          (isRoi ? "disabled" : "") +
          ">" +
          '<option value="enabled"' +
          (rule.status === "enabled" ? " selected" : "") +
          ">" +
          escapeHtml(t("st_enabled")) +
          '</option><option value="disabled"' +
          (rule.status === "disabled" ? " selected" : "") +
          ">" +
          escapeHtml(t("st_disabled")) +
          "</option></select></td>" +
          "<td>" +
          renderCond("c1", rule.c1, condDisabled) +
          "</td>" +
          "<td>" +
          renderCond("c2", rule.c2, condDisabled) +
          "</td>" +
          '<td><div class="cell-inner" style="justify-content:center">' +
          actionCell +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("tr[data-rule-id]").forEach(function (tr) {
      bindRow(tr);
    });
  }

  function findRule(id) {
    const list = store[activeFeatureId] || [];
    return list.find(function (r) {
      return r.id === id;
    });
  }

  function bindRow(tr) {
    const id = tr.dataset.ruleId;
    const rule = findRule(id);
    if (!rule) return;
    const isRoi = getRuleTargetType(rule) === "roi";

    const unifiedTargetSel = tr.querySelector(".unified-target-sel");
    const resultSel = tr.querySelector(".result-sel");
    const statusSel = tr.querySelector(".status-sel");

    if (!isRoi && unifiedTargetSel) {
      unifiedTargetSel.addEventListener("change", function () {
        if (!unifiedTargetSel.value) {
          renderTable();
          return;
        }
        const p = unifiedTargetParse(unifiedTargetSel.value);
        if (!p) {
          renderTable();
          return;
        }
        applyRuleFromUnifiedPick(rule, p);
        persistThresholdStore();
        renderTable();
      });
    }

    if (!isRoi) {
      resultSel.addEventListener("change", function () {
        const prev = rule.result;
        rule.result = resultSel.value;
        if (isNotDetectedResult(rule.result)) {
          rule.c1 = blankCond();
          rule.c2 = blankCond();
        } else if (isNotDetectedResult(prev)) {
          rule.c1 = emptyCond();
          rule.c2 = emptyCond();
        }
        persistThresholdStore();
        renderTable();
      });

      statusSel.addEventListener("change", function () {
        rule.status = statusSel.value;
        persistThresholdStore();
        renderTable();
      });
    }

    tr.querySelectorAll(".cond-group").forEach(function (group) {
      if (isRoi) return;
      const prefix = group.dataset.cond;
      const cond = rule[prefix];

      group.querySelectorAll("select[data-field]").forEach(function (sel) {
        sel.addEventListener("change", function () {
          cond[sel.dataset.field] = sel.value;
          if (sel.dataset.field === "op") {
            persistThresholdStore();
            renderTable();
            return;
          }
          updateRowMmHints(tr, rule);
          persistThresholdStore();
        });
      });

      group.querySelectorAll("input[data-field]").forEach(function (inp) {
        inp.addEventListener("input", function () {
          const cleaned = sanitizePixelIntString(inp.value);
          if (cleaned !== inp.value) {
            inp.value = cleaned;
          }
          cond[inp.dataset.field] = cleaned;
          updateRowMmHints(tr, rule);
          persistThresholdStore();
        });
      });
    });

    if (!isRoi && !isNotDetectedResult(rule.result)) {
      updateRowMmHints(tr, rule);
    }

    if (isRoi) {
      tr.querySelector(".btn-view").addEventListener("click", function () {
        window.location.href = "roi-threshold-view.html?name=" + encodeURIComponent(getRuleTargetName(rule));
      });
      return;
    }

    tr.querySelector(".btn-edit").addEventListener("click", function () {
      if (unifiedTargetSel) unifiedTargetSel.focus();
      showToast(t("toastFovEdit"));
    });

    tr.querySelector(".btn-del").addEventListener("click", function () {
      if (!confirm(t("confirmDelete"))) return;
      store[activeFeatureId] = store[activeFeatureId].filter(function (r) {
        return r.id !== id;
      });
      persistThresholdStore();
      renderTable();
      showToast(t("toastDeleted"));
    });
  }

  /**
   * 为当前选中的缺陷追加一条默认规则。工具栏只决定**+添加行**时的维度；创建通用阈值为「视野」首项。
   * 行内目标见 buildUnifiedTargetSelectHtml。
   * @param {string|undefined} forcedMode 为 "fov" | "cc" | "image" 时强制；未传则使用工具栏
   */
  function tryAddDefaultRuleRow(forcedMode) {
    if (!FEATURES.length || !activeFeatureId) {
      showToast(t("toastAddRowBlocked"));
      return null;
    }
    const mode =
      forcedMode === "fov" || forcedMode === "cc" || forcedMode === "image" ? forcedMode : "fov";
    const fovsForF = getFovsForFeature(activeFeatureId);
    const imgsForF = getImagesForFeature(activeFeatureId);
    const slotsForF = getCcSlotsForFeature(activeFeatureId);
    if (mode === "fov") {
      if (!fovsForF.length) {
        showToast(t("toastNoFeatureBinding"));
        return null;
      }
    } else if (mode === "cc") {
      if (!slotsForF.length) {
        showToast(t("toastNoFeatureBinding"));
        return null;
      }
    } else {
      if (!imgsForF.length) {
        showToast(t("toastNoFeatureBinding"));
        return null;
      }
    }
    if (!store[activeFeatureId]) store[activeFeatureId] = [];
    const rule =
      mode === "fov"
        ? makeRule({
            targetName: fovsForF[0] || "",
            targetType: "fov",
            result: "ng",
            status: "enabled",
            c1: { attr: "area", op: "gte", v1: "", v2: "" },
            c2: emptyCond(),
          })
        : mode === "cc"
          ? makeRule({
              targetType: "cc",
              ccSlotKey: slotsForF[0].key,
              result: "ng",
              status: "enabled",
              c1: { attr: "area", op: "gte", v1: "", v2: "" },
              c2: emptyCond(),
            })
          : makeRule({
              imageId: imgsForF[0] ? imgsForF[0].imageId : "",
              targetType: "image",
              result: "ng",
              status: "enabled",
              c1: { attr: "area", op: "gte", v1: "", v2: "" },
              c2: emptyCond(),
            });
    store[activeFeatureId].push(rule);
    persistThresholdStore();
    return rule;
  }

  function init() {
    TI.wireLangButton();
    document.addEventListener("threshold:locale", function () {
      postIndexI18n();
      renderFeatureList($("#feature-search").value);
      renderTable();
    });
    applyPageI18n();
    renderFeatureList("");
    renderTable();

    $("#feature-search").addEventListener("input", function (e) {
      renderFeatureList(e.target.value);
    });

    (function wireCascadeFilter() {
      const fv = document.getElementById("filter-vision");
      const fc = document.getElementById("filter-cc");
      const fi = document.getElementById("filter-image");
      if (fv) {
        fv.addEventListener("change", function () {
          rebuildCcSelect();
          rebuildImageSelect();
          renderTable();
        });
      }
      if (fc) {
        fc.addEventListener("change", function () {
          rebuildImageSelect();
          renderTable();
        });
      }
      if (fi) {
        fi.addEventListener("change", renderTable);
      }
    })();

    window.addEventListener("focus", function () {
      document.querySelectorAll("#rules-body tr[data-rule-id]").forEach(function (tr) {
        const rid = tr.dataset.ruleId;
        const rule = findRule(rid);
        if (rule) updateRowMmHints(tr, rule);
      });
    });

    window.addEventListener("storage", function (e) {
      if (e.key === LS_PROJECT_CONFIG || e.key === LS_PROJECT_DEPLOY_TS) {
        window.location.reload();
        return;
      }
      if (e.key !== LS_PXMM_RECORDS) return;
      document.querySelectorAll("#rules-body tr[data-rule-id]").forEach(function (tr) {
        const rid = tr.dataset.ruleId;
        const rule = findRule(rid);
        if (rule) updateRowMmHints(tr, rule);
      });
    });
    $("#filter-status").addEventListener("change", renderTable);
    $("#sort-by").addEventListener("change", renderTable);
    $("#sort-dir").addEventListener("change", renderTable);

    $("#toggle-unconfigured").addEventListener("change", function () {
      const onlyUnconfigured = $("#toggle-unconfigured").checked;
      const firstPick = onlyUnconfigured
        ? FEATURES.find(function (f) {
            return !f.configured;
          })
        : FEATURES[0] || null;
      if (firstPick) activeFeatureId = firstPick.id;
      else activeFeatureId = "";
      renderFeatureList($("#feature-search").value);
      renderTable();
    });

    $("#btn-add-row").addEventListener("click", function () {
      const rule = tryAddDefaultRuleRow();
      if (!rule) return;
      renderTable();
      showToast(t("toastAddRow"));
    });

    $("#btn-create-universal").addEventListener("click", function () {
      const rule = tryAddDefaultRuleRow("fov");
      if (!rule) return;
      const fSt = $("#filter-status");
      if (fSt) fSt.value = "";
      rebuildVisionSelect();
      const vSel = document.getElementById("filter-vision");
      if (vSel && getRuleTargetType(rule) === "fov" && rule.fov) {
        vSel.value = rule.fov;
        rebuildCcSelect();
        const cSel2 = document.getElementById("filter-cc");
        if (cSel2) cSel2.value = "";
        rebuildImageSelect();
        const iSel2 = document.getElementById("filter-image");
        if (iSel2) iSel2.value = "";
      } else {
        rebuildCascadeFilters();
      }
      renderTable();
      showToast(t("toastUniversalRuleAdded"));
    });

    $("#btn-deploy").addEventListener("click", function () {
      showToast(t("toastDemoDeploy"));
    });

    (function bindIoModal() {
      const backdrop = $("#io-modal");
      const open = function () {
        backdrop.classList.add("is-open");
        backdrop.setAttribute("aria-hidden", "false");
      };
      const close = function () {
        backdrop.classList.remove("is-open");
        backdrop.setAttribute("aria-hidden", "true");
      };

      $("#btn-io").addEventListener("click", open);

      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) close();
      });

      $("#io-modal-cancel").addEventListener("click", close);

      $("#io-choose-import").addEventListener("click", function () {
        close();
        showToast(t("toastDemoImport"));
      });

      $("#io-choose-export").addEventListener("click", function () {
        close();
        showToast(t("toastDemoExport"));
      });
    })();

    $("#btn-custom-threshold").addEventListener("click", function () {
      window.location.href = "custom-threshold.html";
    });

    $("#btn-roi").addEventListener("click", function () {
      showToast(t("toastDemoRoi"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
