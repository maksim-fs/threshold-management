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

  const RESULTS = [
    { value: "ng", label: "NG" },
    { value: "limit", label: "Limit" },
    { value: "not_detected_ng", label: "未检出时判 NG" },
  ];

  const FOVS = [
    "CCD1-顶盖正面",
    "CCD2-左侧面",
    "CCD3-右侧面",
    "CCD4-头部",
    "CCD4-尾部",
    "CCD4-顶盖背面",
  ];
  const ROI_TARGETS = ["注液孔ROI", "蓝膜ROI", "顶盖二维码ROI"];

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
      if (q && !f.name.toLowerCase().includes(q) && !f.id.toLowerCase().includes(q)) return;
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
        escapeHtml(f.name) +
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

  function selectOptions(list, current) {
    return list
      .map(function (o) {
        return (
          '<option value="' +
          escapeHtml(o.value) +
          '"' +
          (o.value === current ? " selected" : "") +
          ">" +
          escapeHtml(o.label) +
          "</option>"
        );
      })
      .join("");
  }

  function fovOptions(current) {
    return FOVS.map(function (f) {
      return (
        '<option value="' +
        escapeHtml(f) +
        '"' +
        (f === current ? " selected" : "") +
        ">" +
        escapeHtml(f) +
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
      if (attrUsesAreaPx2(attr)) {
        const mm2 = px * mm2PerPx2;
        return "（≈ " + fmtMmTwoDecimals(mm2) + " mm²）";
      }
      const mmPerPx = Math.sqrt(mm2PerPx2);
      const mmLin = px * mmPerPx;
      return "（≈ " + fmtMmTwoDecimals(mmLin) + " mm）";
    }
    const mmPerPx = mmCal / pxCal;
    if (!(mmPerPx > 0)) return "";
    if (attrUsesAreaPx2(attr)) {
      const mm2 = px * mmPerPx * mmPerPx;
      return "（≈ " + fmtMmTwoDecimals(mm2) + " mm²）";
    }
    const mmLin = px * mmPerPx;
    return "（≈ " + fmtMmTwoDecimals(mmLin) + " mm）";
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
    if (getRuleTargetType(rule) === "roi") {
      return (
        '<span class="target-name">' +
        escapeHtml(name) +
        '<span class="target-badge">ROI</span></span>'
      );
    }
    return escapeHtml(name);
  }

  function renderCond(prefix, cond, disabled) {
    if (disabled) {
      return (
        '<div class="cond-group is-disabled" data-cond="' +
        prefix +
        '">' +
        '<select class="cond-select" disabled title="未检出时判 NG 无需条件">' +
        '<option value=""></option></select>' +
        '<select class="cond-select" disabled title="未检出时判 NG 无需条件">' +
        '<option value=""></option></select>' +
        '<input type="text" class="cond-input" disabled value="" title="未检出时判 NG 无需条件" />' +
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
        escapeHtml(a.label) +
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
        escapeHtml(o.label) +
        "</option>"
      );
    }).join("");

    const valBlock = between
      ? '<span class="cond-between">' +
        '<span class="cond-val-inline">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="cond-input cond-input--narrow" data-field="v1" value="' +
        escapeHtml(cond.v1) +
        '" placeholder="下限(px)" title="像素，仅整数" ' +
        (disabled ? "disabled" : "") +
        "/>" +
        mmHint("v1") +
        "</span>" +
        '<span class="cond-sep">~</span>' +
        '<span class="cond-val-inline">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="cond-input cond-input--narrow" data-field="v2" value="' +
        escapeHtml(cond.v2) +
        '" placeholder="上限(px)" title="像素，仅整数" ' +
        (disabled ? "disabled" : "") +
        "/>" +
        mmHint("v2") +
        "</span>" +
        "</span>"
      : '<span class="cond-val-inline">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="cond-input" data-field="v1" value="' +
        escapeHtml(cond.v1) +
        '" placeholder="像素(整数)" title="像素，仅整数" ' +
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
    if (sortBy === "created") {
      rows.sort(function (a, b) {
        return (a.createdAt - b.createdAt) * dirMul;
      });
    }
    return rows;
  }

  function renderTable() {
    const tbody = $("#rules-body");
    const rows = getRulesForDisplay();
    const allRows = store[activeFeatureId] || [];

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:24px;color:#909399;">暂无符合条件的阈值行' +
        (allRows.length ? "（可调整上方筛选）" : "，请添加阈值行") +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = rows
      .map(function (rule, i) {
        const isRoi = getRuleTargetType(rule) === "roi";
        const notDet = isNotDetectedResult(rule.result);
        const condDisabled = notDet || isRoi;
        const resOpts = RESULTS.map(function (r) {
          return (
            '<option value="' +
            escapeHtml(r.value) +
            '"' +
            (r.value === rule.result ? " selected" : "") +
            ">" +
            escapeHtml(r.label) +
            "</option>"
          );
        }).join("");
        const targetCell = isRoi
          ? '<div class="target-wrap">' + renderTargetName(rule) + "</div>"
          : "<select class=\"select fov-sel\" style=\"min-width:200px\">" + fovOptions(getRuleTargetName(rule)) + "</select>";
        const actionCell = isRoi
          ? '<button type="button" class="text-btn btn-view">查看</button>'
          : '<button type="button" class="text-btn btn-edit">编辑</button><button type="button" class="text-btn danger btn-del">删除</button>';

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
          '>启用</option><option value="disabled"' +
          (rule.status === "disabled" ? " selected" : "") +
          '>禁用</option></select></td>' +
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
      showToast("当前为视野阈值，可直接在表格中编辑");
    });

    tr.querySelector(".btn-del").addEventListener("click", function () {
      if (!confirm("确定删除该阈值行吗？")) return;
      store[activeFeatureId] = store[activeFeatureId].filter(function (r) {
        return r.id !== id;
      });
      renderTable();
      showToast("已删除");
    });
  }

  function init() {
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
      showToast("已添加一行");
    });

    $("#btn-create-universal").addEventListener("click", function () {
      showToast("演示：创建通用阈值（可接后端接口）");
    });

    $("#btn-deploy").addEventListener("click", function () {
      showToast("演示：阈值已提交部署（可接后端接口）");
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
        showToast("演示：请选择文件导入");
      });

      $("#io-choose-export").addEventListener("click", function () {
        close();
        showToast("演示：导出阈值 JSON（可接下载）");
      });
    })();

    $("#btn-custom-threshold").addEventListener("click", function () {
      window.location.href = "custom-threshold.html";
    });

    $("#btn-roi").addEventListener("click", function () {
      showToast("演示：ROI 阈值配置");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
