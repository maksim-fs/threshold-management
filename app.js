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
    if (!document.getElementById("filter-fov")) return;
    rebuildFovFilter();
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

  const FOVS = [
    "CCD1-顶盖正面",
    "CCD2-左侧面",
    "CCD3-右侧面",
    "CCD4-头部",
    "CCD4-尾部",
    "CCD4-顶盖背面",
  ];
  const ROI_TARGETS = ["注液孔ROI", "蓝膜ROI", "顶盖二维码ROI"];

  function targetDisplayName(internal) {
    return TI.targetDisplayName(internal);
  }

  function rebuildFovFilter() {
    const sel = document.getElementById("filter-fov");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = t("filterAllFovRoi");
    sel.appendChild(o0);
    FOVS.forEach(function (f) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = targetDisplayName(f);
      sel.appendChild(o);
    });
    ROI_TARGETS.forEach(function (r) {
      const o = document.createElement("option");
      o.value = r;
      o.textContent = targetDisplayName(r);
      sel.appendChild(o);
    });
    var has = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === prev) {
        has = true;
        break;
      }
    }
    sel.value = has ? prev : "";
  }

  /** 与「像素/毫米」工具共用，毫米转化记录 */
  const LS_PXMM_RECORDS = "pxmm_convert_records_v1";

  function ts(iso) {
    return new Date(iso).getTime();
  }

  const FEATURES = [
    { id: "scratch", name: "划痕", icon: "neg", configured: true },
    { id: "bump", name: "凸点", icon: "ok", configured: true },
    { id: "stain", name: "污渍", icon: "neg", configured: true },
    { id: "particle", name: "异物颗粒", icon: "ok", configured: true },
    { id: "edge_chip", name: "崩边", icon: "neg", configured: true },
    { id: "wrinkle", name: "褶皱", icon: "neg", configured: false },
    { id: "f2", name: "Feature_2", icon: "neg", configured: true },
    { id: "f3", name: "Feature_3", icon: "ok", configured: true },
  ];

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
    return rule.targetName || rule.fov || FOVS[0];
  }

  function getRuleTargetType(rule) {
    if (rule.targetType) return rule.targetType;
    return isRoiTarget(getRuleTargetName(rule)) ? "roi" : "fov";
  }

  function makeRule(partial) {
    const result = partial.result || "ng";
    const nd = result === "not_detected_ng";
    const targetName = partial.targetName || partial.fov || FOVS[0];
    const targetType = partial.targetType || (isRoiTarget(targetName) ? "roi" : "fov");
    return {
      id: "r" + ++ruleIdSeq,
      createdAt: partial.createdAt != null ? partial.createdAt : Date.now(),
      targetName: targetName,
      targetType: targetType,
      result: result,
      status: partial.status || "enabled",
      c1: nd ? blankCond() : partial.c1 ? { ...partial.c1 } : emptyCond(),
      c2: nd ? blankCond() : partial.c2 ? { ...partial.c2 } : emptyCond(),
    };
  }

  const store = {
    scratch: [
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "not_detected_ng",
        status: "enabled",
        createdAt: ts("2026-04-18T09:00:00"),
      }),
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "ng",
        status: "enabled",
        c1: { attr: "mr_length", op: "gte", v1: "25", v2: "" },
        c2: { attr: "mr_width", op: "lte", v1: "8", v2: "" },
        createdAt: ts("2026-04-19T11:20:00"),
      }),
      makeRule({
        targetName: "注液孔ROI",
        targetType: "roi",
        result: "limit",
        status: "disabled",
        c1: { attr: "area", op: "between", v1: "12", v2: "28" },
        c2: { attr: "v_height", op: "gte", v1: "15", v2: "" },
        createdAt: ts("2026-04-20T08:05:00"),
      }),
      makeRule({
        fov: "CCD4-头部",
        result: "ng",
        status: "enabled",
        c1: { attr: "h_width", op: "gte", v1: "12", v2: "" },
        c2: emptyCond(),
        createdAt: ts("2026-04-20T15:30:00"),
      }),
    ],
    bump: [
      makeRule({
        fov: "CCD2-左侧面",
        result: "ng",
        status: "enabled",
        c1: { attr: "area", op: "gte", v1: "30", v2: "" },
        c2: { attr: "x", op: "between", v1: "120", v2: "480" },
        createdAt: ts("2026-04-17T14:00:00"),
      }),
      makeRule({
        targetName: "蓝膜ROI",
        targetType: "roi",
        result: "limit",
        status: "enabled",
        c1: { attr: "mr_length", op: "between", v1: "40", v2: "110" },
        c2: emptyCond(),
        createdAt: ts("2026-04-21T10:12:00"),
      }),
    ],
    stain: [
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "ng",
        status: "enabled",
        c1: { attr: "area", op: "gte", v1: "85", v2: "" },
        c2: { attr: "y", op: "lte", v1: "640", v2: "" },
        createdAt: ts("2026-04-16T16:45:00"),
      }),
      makeRule({
        fov: "CCD3-右侧面",
        result: "not_detected_ng",
        status: "enabled",
        createdAt: ts("2026-04-19T09:30:00"),
      }),
    ],
    particle: [
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "ng",
        status: "enabled",
        c1: { attr: "area", op: "between", v1: "50", v2: "200" },
        c2: { attr: "v_height", op: "gte", v1: "5", v2: "" },
        createdAt: ts("2026-04-20T13:46:00"),
      }),
    ],
    edge_chip: [
      makeRule({
        fov: "CCD4-顶盖背面",
        result: "limit",
        status: "enabled",
        c1: { attr: "mr_length", op: "gte", v1: "30", v2: "" },
        c2: { attr: "h_width", op: "lte", v1: "20", v2: "" },
        createdAt: ts("2026-04-15T11:00:00"),
      }),
      makeRule({
        fov: "CCD4-尾部",
        result: "ng",
        status: "disabled",
        c1: { attr: "area", op: "gte", v1: "15", v2: "" },
        c2: emptyCond(),
        createdAt: ts("2026-04-21T07:55:00"),
      }),
    ],
    wrinkle: [],
    f2: [
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "not_detected_ng",
        status: "enabled",
        createdAt: ts("2026-04-10T10:00:00"),
      }),
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "ng",
        status: "enabled",
        c1: { attr: "mr_length", op: "gte", v1: "40", v2: "" },
        c2: { attr: "mr_width", op: "gte", v1: "20", v2: "" },
        createdAt: ts("2026-04-12T14:22:00"),
      }),
      makeRule({
        fov: "CCD2-左侧面",
        result: "ng",
        status: "enabled",
        c1: { attr: "area", op: "lte", v1: "6", v2: "" },
        c2: emptyCond(),
        createdAt: ts("2026-04-14T08:00:00"),
      }),
    ],
    f3: [
      makeRule({
        targetName: "顶盖二维码ROI",
        targetType: "roi",
        result: "limit",
        status: "enabled",
        c1: { attr: "area", op: "between", v1: "50", v2: "100" },
        c2: { attr: "x", op: "between", v1: "200", v2: "800" },
        createdAt: ts("2026-04-11T09:15:00"),
      }),
      makeRule({
        fov: "CCD1-顶盖正面",
        result: "ng",
        status: "enabled",
        c1: { attr: "y", op: "gte", v1: "100", v2: "" },
        c2: emptyCond(),
        createdAt: ts("2026-04-13T16:40:00"),
      }),
    ],
  };

  let activeFeatureId = "scratch";

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
    FEATURES.forEach(function (f) {
      if (onlyUnconfigured && f.configured) return;
      const disp = t("feature_" + f.id);
      const dispZh = TI.I18N.zh["feature_" + f.id] != null ? TI.I18N.zh["feature_" + f.id] : f.name;
      const enLab = (TI.I18N.en["feature_" + f.id] && TI.I18N.en["feature_" + f.id].toString()) || "";
      if (q) {
        const hit =
          disp.toLowerCase().includes(q) ||
          String(dispZh).toLowerCase().includes(q) ||
          enLab.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q);
        if (!hit) return;
      }
      const li = document.createElement("li");
      li.className = "feature-item" + (f.id === activeFeatureId ? " is-active" : "");
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

  function fovOptions(current) {
    return FOVS.map(function (f) {
      return (
        '<option value="' +
        escapeHtml(f) +
        '"' +
        (f === current ? " selected" : "") +
        ">" +
        escapeHtml(targetDisplayName(f)) +
        "</option>"
      );
    }).join("");
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
    const fov = getRuleTargetName(rule);
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
    const show = targetDisplayName(name);
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

  function getRulesForDisplay() {
    const rows = (store[activeFeatureId] || []).filter(function (r) {
      const fovF = $("#filter-fov").value;
      const stF = $("#filter-status").value;
      if (fovF && getRuleTargetName(r) !== fovF) return false;
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
          : "<select class=\"select fov-sel\" style=\"min-width:200px\">" + fovOptions(getRuleTargetName(rule)) + "</select>";
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

    const fovSel = tr.querySelector(".fov-sel");
    const resultSel = tr.querySelector(".result-sel");
    const statusSel = tr.querySelector(".status-sel");

    if (!isRoi && fovSel) {
      fovSel.addEventListener("change", function () {
        rule.targetName = fovSel.value;
        rule.targetType = "fov";
        updateRowMmHints(tr, rule);
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
        renderTable();
      });

      statusSel.addEventListener("change", function () {
        rule.status = statusSel.value;
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
            renderTable();
            return;
          }
          updateRowMmHints(tr, rule);
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
        if (fovSel) fovSel.focus();
        showToast(t("toastFovEdit"));
      });

      tr.querySelector(".btn-del").addEventListener("click", function () {
        if (!confirm(t("confirmDelete"))) return;
      store[activeFeatureId] = store[activeFeatureId].filter(function (r) {
        return r.id !== id;
      });
      renderTable();
      showToast(t("toastDeleted"));
    });
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

    $("#filter-fov").addEventListener("change", renderTable);

    window.addEventListener("focus", function () {
      document.querySelectorAll("#rules-body tr[data-rule-id]").forEach(function (tr) {
        const rid = tr.dataset.ruleId;
        const rule = findRule(rid);
        if (rule) updateRowMmHints(tr, rule);
      });
    });

    window.addEventListener("storage", function (e) {
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
      if ($("#toggle-unconfigured").checked) {
        const cur = FEATURES.find(function (f) {
          return f.id === activeFeatureId;
        });
        if (cur && cur.configured) {
          const firstUn = FEATURES.find(function (f) {
            return !f.configured;
          });
          if (firstUn) activeFeatureId = firstUn.id;
        }
      }
      renderFeatureList($("#feature-search").value);
      renderTable();
    });

    $("#btn-add-row").addEventListener("click", function () {
      if (!store[activeFeatureId]) store[activeFeatureId] = [];
      store[activeFeatureId].push(
        makeRule({
          targetName: FOVS[0],
          targetType: "fov",
          result: "ng",
          status: "enabled",
          c1: { attr: "area", op: "gte", v1: "", v2: "" },
          c2: emptyCond(),
        })
      );
      renderTable();
      showToast(t("toastAddRow"));
    });

    $("#btn-create-universal").addEventListener("click", function () {
      showToast(t("toastDemoUniversal"));
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
