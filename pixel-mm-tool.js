(function () {
  "use strict";

  const TI = window.ThresholdI18n;
  function tr(k) {
    return TI && typeof TI.t === "function" ? TI.t(k) : k;
  }
  function trFmt(k, o) {
    var s = tr(k);
    if (!o) return s;
    for (var varKey in o) {
      if (Object.prototype.hasOwnProperty.call(o, varKey)) {
        s = s.split("{" + varKey + "}").join(String(o[varKey]));
      }
    }
    return s;
  }
  function metricLabel(key) {
    if (!key) return "";
    return tr("pxmm_m_" + key) || key;
  }
  function fovDisplay(name) {
    if (name == null || name === "") return "—";
    if (name === "—") return "—";
    return TI && typeof TI.targetDisplayName === "function" ? TI.targetDisplayName(name) : name;
  }
  function lineSampleText(n, w, h) {
    return trFmt("pxmm_lineSampleCanvas", { n: n + 1, w: w, h: h });
  }

  const FOVS = [
    "CCD1-顶盖正面",
    "CCD2-左侧面",
    "CCD3-右侧面",
    "CCD4-头部",
    "CCD4-尾部",
    "CCD4-顶盖背面",
  ];

  /** 毫米转化记录 JSON 数组（localStorage） */
  const LS_RECORDS_KEY = "pxmm_convert_records_v1";
  /** 曾用键名，迁移到 LS_RECORDS_KEY 后删除 */
  const LS_LEGACY_ARRAY_KEY = "pxmm_calib_records_v1";
  /** 更旧：单条 key 前缀（迁移后删除） */
  const LS_OLD_PREFIX = "pxMmCalib_";

  const IDB_NAME = "pxmm_convert_images_v1";
  const IDB_STORE = "images";
  const IDB_VER = 1;

  let thumbObjectUrls = [];
  let currentImageObjectUrl = null;

  const METRIC_KEYS = [
    "center_x",
    "center_y",
    "area",
    "seg_len",
    "mr_len",
    "mr_wid",
    "rect_w",
    "rect_h",
    "rect_area",
    "rect_diag",
    "circ_r",
    "circ_d",
    "circ_c",
    "circ_a",
  ];

  let imgEl = null;
  let drawCanvas = null;
  let drawCtx = null;
  let vertices = [];
  let closed = false;
  let lastMetrics = null;
  /** poly / line / rect(轴对齐) / circle(心+圆上点) */
  var drawTool = "poly";
  var lineSessionDirty = false;
  var lineQueueLastIndex = 0;

  function markLineSessionDirty() {
    if (getImageSourceMode() === "line" && lineImageQueue.length && !($("edit-record-id") && ($("edit-record-id").value || "").trim())) {
      lineSessionDirty = true;
    }
  }
  function clearLineSessionDirty() {
    lineSessionDirty = false;
  }

  /** 产线模式：多图 + 每张自带视野 { fov, objectUrl, name, file? } */
  let lineImageQueue = [];

  /** 克隆弹窗：源记录 id */
  let cloneSourceId = null;


  function getImageSourceMode() {
    const c = document.querySelector('input[name="pxmm-image-source"]:checked');
    if (c && c.value === "line") return "line";
    return "manual";
  }

  function setImageSourceMode(mode, skipChangeEvent) {
    const line = $("pxmm-source-line");
    const man = $("pxmm-source-manual");
    if (!line || !man) return;
    if (mode === "line") {
      line.checked = true;
    } else {
      man.checked = true;
    }
    if (!skipChangeEvent) onImageSourceModeChange();
  }

  function onImageSourceModeChange() {
    const editing = ($("edit-record-id") && ($("edit-record-id").value || "").trim()) !== "";
    if (getImageSourceMode() === "manual") {
      revokeLineQueue();
      if ($("file-image-line")) $("file-image-line").value = "";
    } else {
      if (!editing && $("fov-select")) $("fov-select").value = "";
      if ($("file-image-manual")) $("file-image-manual").value = "";
    }
    updateImageSourceUI();
  }

  function lineQueueHasObjectUrl(u) {
    for (var i = 0; i < lineImageQueue.length; i++) {
      if (lineImageQueue[i].objectUrl === u) return true;
    }
    return false;
  }

  function revokeLineQueue() {
    const urls = lineImageQueue.map(function (x) {
      return x.objectUrl;
    });
    lineImageQueue.forEach(function (x) {
      if (x && x.objectUrl) {
        try {
          URL.revokeObjectURL(x.objectUrl);
        } catch (e) {}
      }
    });
    lineImageQueue = [];
    if (currentImageObjectUrl && urls.indexOf(currentImageObjectUrl) >= 0) {
      currentImageObjectUrl = null;
      if (imgEl) {
        try {
          imgEl.removeAttribute("src");
        } catch (e) {}
      }
    }
    const q = $("line-queue");
    if (q) {
      q.innerHTML = "";
      q.disabled = true;
    }
    const strip = $("line-preview-strip");
    if (strip) strip.innerHTML = "";
  }

  /** 根据文件名尝试匹配产线预置视野名；无匹配时返回 null，由入队时按序 fallback */
  function guessFovFromFileName(name) {
    const s = String(name);
    for (var j = 0; j < FOVS.length; j++) {
      if (s.indexOf(FOVS[j]) >= 0) return FOVS[j];
    }
    return null;
  }

  function setLineFovDisplay(text) {
    const el = $("fov-line-display");
    if (el) el.textContent = text;
  }

  function updateImageSourceUI() {
    const lineG = $("pxmm-line-group");
    const manG = $("pxmm-manual-group");
    const fovL = $("pxmm-line-fov-wrap");
    const samples = $("pxmm-manual-samples");
    const isLine = getImageSourceMode() === "line";
    if (lineG) {
      lineG.style.display = isLine ? "" : "none";
      lineG.setAttribute("aria-hidden", isLine ? "false" : "true");
    }
    if (manG) manG.style.display = isLine ? "none" : "";
    if (fovL) {
      fovL.style.display = isLine ? "inline-flex" : "none";
      fovL.setAttribute("aria-hidden", isLine ? "false" : "true");
    }
    if (samples) samples.style.display = isLine ? "none" : "flex";
    if (!isLine) {
      if (lineImageQueue.length === 0) setLineFovDisplay("—");
    } else {
      if (lineImageQueue.length === 0) {
        setLineFovDisplay(tr("pxmm_pleaseImportLine"));
      }
    }
    const qs = $("line-queue");
    const n = lineImageQueue.length;
    if (qs) {
      if (!isLine || n === 0) {
        qs.style.display = "none";
        qs.disabled = true;
      } else {
        qs.style.display = "";
        qs.disabled = n <= 1;
      }
    }
    const quick = $("pxmm-line-quick-wrap");
    if (quick) {
      quick.style.display = isLine && n > 0 ? "flex" : "none";
      quick.setAttribute("aria-hidden", isLine && n > 0 ? "false" : "true");
    }
    const prevBox = $("pxmm-line-preview");
    if (prevBox) {
      if (isLine && n > 0) {
        prevBox.style.display = "block";
        prevBox.removeAttribute("hidden");
        prevBox.setAttribute("aria-hidden", "false");
      } else {
        prevBox.style.display = "none";
        prevBox.setAttribute("hidden", "true");
        prevBox.setAttribute("aria-hidden", "true");
      }
    }
    updateLineBatchSaveUI();
  }

  function populateLineQueueSelect() {
    const q = $("line-queue");
    if (!q) return;
    const html = lineImageQueue
      .map(function (x, i) {
        const short = x.name && x.name.length > 32 ? x.name.slice(0, 30) + "…" : (x.name || "image");
        return (
          '<option value="' +
          i +
          '">' +
          (i + 1) +
          " · " +
          escapeHtml(fovDisplay(x.fov)) +
          " — " +
          escapeHtml(short) +
          "</option>"
        );
      })
      .join("");
    q.innerHTML = html;
    if (lineImageQueue.length) {
      q.value = "0";
      q.disabled = lineImageQueue.length <= 1;
    } else {
      q.disabled = true;
    }
  }

  function updateLineProgressAndNav(currentIdx) {
    const p = $("line-preview-progress");
    const n = lineImageQueue.length;
    if (p) {
      if (!n) {
        p.textContent = "—";
      } else {
        const fov = lineImageQueue[currentIdx] && lineImageQueue[currentIdx].fov;
        if (fov) {
          p.textContent = trFmt("pxmm_lineProgress", {
            cur: currentIdx + 1,
            n: n,
            fov: fovDisplay(fov),
          });
        } else {
          p.textContent = trFmt("pxmm_lineProgressPlain", { cur: currentIdx + 1, n: n });
        }
      }
    }
    const pbtn = $("btn-line-prev");
    if (pbtn) pbtn.disabled = n <= 1 || currentIdx <= 0;
    const nbtn = $("btn-line-next");
    if (nbtn) nbtn.disabled = n <= 1 || currentIdx >= n - 1;
  }

  function renderLinePreviewThumbs(activeIndex) {
    const strip = $("line-preview-strip");
    if (!strip) return;
    if (!lineImageQueue.length) {
      strip.innerHTML = "";
      return;
    }
    strip.innerHTML = lineImageQueue
      .map(function (item, i) {
        return (
          "<button type=\"button\" class=\"pxmm-tile" +
          (i === activeIndex ? " is-active" : "") +
          "\" data-line-idx=\"" +
          i +
          "\" role=\"option\" aria-selected=\"" +
          (i === activeIndex ? "true" : "false") +
          "\">" +
          "<img class=\"pxmm-tile-img\" src=\"" +
          String(item.objectUrl)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;") +
          "\" alt=\"\" width=\"80\" height=\"60\" />" +
          "<span class=\"pxmm-tile-fov\">" +
          escapeHtml(fovDisplay(item.fov)) +
          "</span><span class=\"pxmm-tile-name\" title=\"" +
          escapeHtml(item.name || "") +
          "\">" +
          escapeHtml(
            (item.name && item.name.length > 18 ? item.name.slice(0, 16) + "…" : item.name) || ""
          ) +
          "</span></button>"
        );
      })
      .join("");
  }

  function goToLineIndex(index, options) {
    options = options || {};
    if (lineImageQueue.length === 0) return;
    if (index < 0) index = 0;
    if (index >= lineImageQueue.length) index = lineImageQueue.length - 1;
    if (
      index !== lineQueueLastIndex &&
      getImageSourceMode() === "line" &&
      lineImageQueue.length &&
      !($("edit-record-id") && ($("edit-record-id").value || "").trim()) &&
      lineSessionDirty &&
      !options.skipDirtyCheck
    ) {
      if (!confirm(tr("pxmm_confirmUnsavedLine"))) {
        if (!options.skipSelect) {
          const s0 = $("line-queue");
          if (s0) s0.value = String(lineQueueLastIndex);
        }
        renderLinePreviewThumbs(lineQueueLastIndex);
        return;
      }
      clearLineSessionDirty();
    }
    if (!options.skipSelect) {
      const s = $("line-queue");
      if (s) s.value = String(index);
    }
    lineQueueLastIndex = index;
    const item = lineImageQueue[index];
    if (!item) return;
    setLineFovDisplay(fovDisplay(item.fov));
    renderLinePreviewThumbs(index);
    updateLineProgressAndNav(index);
    if (!options.skipImage) {
      setImageFromUrl(item.objectUrl, { keepDrawTool: true });
    }
  }

  function loadLineImageAt(index) {
    if (index < 0 || index >= lineImageQueue.length) return;
    goToLineIndex(index, { skipSelect: true, skipImage: false });
  }

  function dataUrlToBlob(dataUrl, callback) {
    try {
      if (String(dataUrl).indexOf("data:") === 0) {
        const arr = dataUrl.split(",");
        const mime = arr[0].match(/data:(.+);/);
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8 = new Uint8Array(n);
        while (n--) u8[n] = bstr.charCodeAt(n);
        callback(
          new Blob([u8], {
            type: mime && mime[1] ? mime[1] : "image/png",
          })
        );
        return;
      }
    } catch (e) {}
    callback(null);
  }

  function rebuildLineQueueFromFiles(fileList) {
    revokeLineQueue();
    clearLineSessionDirty();
    if (!fileList || !fileList.length) {
      setLineFovDisplay(tr("pxmm_pleaseImportLine"));
      updateImageSourceUI();
      return;
    }
    const n = fileList.length;
    for (var i = 0; i < n; i++) {
      const f = fileList[i];
      if (!f || !f.type || f.type.indexOf("image/") !== 0) continue;
      const g = guessFovFromFileName(f.name);
      const fov = g || FOVS[i % FOVS.length];
      const objectUrl = URL.createObjectURL(f);
      lineImageQueue.push({ file: f, fov: fov, objectUrl: objectUrl, name: f.name || "image" });
    }
    populateLineQueueSelect();
    if (lineImageQueue.length) {
      lineQueueLastIndex = 0;
      goToLineIndex(0, { skipDirtyCheck: true });
    } else {
      setLineFovDisplay(tr("pxmm_lineNoImage"));
    }
    updateImageSourceUI();
  }

  function getCurrentFovForSave() {
    const editId = ($("edit-record-id") && ($("edit-record-id").value || "").trim()) || "";
    if (editId) {
      return ($("fov-select") && $("fov-select").value) || "";
    }
    if (getImageSourceMode() === "line") {
      if (!lineImageQueue.length) return "";
      const sel = $("line-queue");
      let idx = 0;
      if (sel && sel.value !== "" && !Number.isNaN(parseInt(sel.value, 10))) {
        idx = Math.max(0, Math.min(lineImageQueue.length - 1, parseInt(sel.value, 10)));
      }
      return lineImageQueue[idx] && lineImageQueue[idx].fov ? lineImageQueue[idx].fov : "";
    }
    return ($("fov-select") && $("fov-select").value) || "";
  }

  function setSourcePanelVisible(show) {
    const p = $("pxmm-source-panel");
    if (!p) return;
    if (show) p.classList.remove("pxmm-source-panel--hidden");
    else p.classList.add("pxmm-source-panel--hidden");
  }

  function revokeThumbUrls() {
    thumbObjectUrls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {}
    });
    thumbObjectUrls = [];
  }

  /** 当前闭合图形的顶点（图像像素坐标），用于保存到记录 */
  function serializeShapeIfComplete() {
    if (!isShapeCompleteForCurrentTool()) return null;
    return vertices.map(function (v) {
      return { x: v.x, y: v.y };
    });
  }

  function minPolyPointsForTool(t) {
    if (t === "line" || t === "rect" || t === "circle") return 2;
    return 3;
  }

  /** 保存时：优先用当前绘制；否则编辑模式下沿用记录里已有区域 */
  function getPolygonForSave(editId, list) {
    const cur = serializeShapeIfComplete();
    if (cur) return cur;
    if (editId) {
      const prev = list.find(function (x) {
        return x.id === editId;
      });
      if (prev && Array.isArray(prev.polygon)) {
        const tool = prev.drawTool || (prev.polygon.length === 2 ? "line" : "poly");
        if (prev.polygon.length >= minPolyPointsForTool(tool)) {
          return prev.polygon.map(function (p) {
            return { x: Number(p.x), y: Number(p.y) };
          });
        }
      }
    }
    return null;
  }

  /** 生成带多边形/线段/矩形/圆 标记的缩略图 blob URL（需调用方收入 thumbObjectUrls 以便统一 revoke） */
  function buildThumbObjectUrl(blob, polygon, dTool) {
    const t = dTool || (polygon && polygon.length === 2 ? "line" : "poly");
    return new Promise(function (resolve) {
      const srcUrl = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = function () {
        try {
          const maxW = 120;
          const maxH = 90;
          const nw = im.naturalWidth || im.width;
          const nh = im.naturalHeight || im.height;
          if (!nw || !nh) {
            URL.revokeObjectURL(srcUrl);
            resolve(URL.createObjectURL(blob));
            return;
          }
          const sc = Math.min(maxW / nw, maxH / nh, 1);
          const cw = Math.max(1, Math.round(nw * sc));
          const ch = Math.max(1, Math.round(nh * sc));
          const c = document.createElement("canvas");
          c.width = cw;
          c.height = ch;
          const ctx = c.getContext("2d");
          ctx.drawImage(im, 0, 0, cw, ch);
          if (polygon && polygon.length) {
            if (t === "line" && polygon.length >= 2) {
              ctx.save();
              ctx.strokeStyle = "#16a34a";
              ctx.lineWidth = Math.max(2, 2 / sc);
              ctx.beginPath();
              ctx.moveTo(Number(polygon[0].x) * sc, Number(polygon[0].y) * sc);
              ctx.lineTo(Number(polygon[1].x) * sc, Number(polygon[1].y) * sc);
              ctx.stroke();
              ctx.restore();
            } else if (t === "rect" && polygon.length >= 2) {
              const x0 = Number(polygon[0].x) * sc;
              const y0 = Number(polygon[0].y) * sc;
              const x1 = Number(polygon[1].x) * sc;
              const y1 = Number(polygon[1].y) * sc;
              const l = Math.min(x0, x1);
              const tp = Math.min(y0, y1);
              const w = Math.abs(x1 - x0);
              const h = Math.abs(y1 - y0);
              ctx.save();
              ctx.fillStyle = "rgba(34, 197, 94, 0.2)";
              ctx.strokeStyle = "#16a34a";
              ctx.lineWidth = Math.max(2, 2 / sc);
              ctx.fillRect(l, tp, w, h);
              ctx.strokeRect(l, tp, w, h);
              ctx.restore();
            } else if (t === "circle" && polygon.length >= 2) {
              const cx = Number(polygon[0].x) * sc;
              const cy = Number(polygon[0].y) * sc;
              const pr = Math.sqrt(
                (Number(polygon[1].x) - Number(polygon[0].x)) * (Number(polygon[1].x) - Number(polygon[0].x)) +
                  (Number(polygon[1].y) - Number(polygon[0].y)) * (Number(polygon[1].y) - Number(polygon[0].y))
              );
              const rad = pr * sc;
              ctx.save();
              ctx.beginPath();
              ctx.arc(cx, cy, Math.max(1, rad), 0, Math.PI * 2);
              ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
              ctx.fill();
              ctx.strokeStyle = "#16a34a";
              ctx.lineWidth = Math.max(2, 2 / sc);
              ctx.stroke();
              ctx.restore();
            } else if (t === "poly" && polygon.length >= 3) {
              ctx.save();
              ctx.lineJoin = "round";
              ctx.lineCap = "round";
              ctx.strokeStyle = "#16a34a";
              ctx.lineWidth = Math.max(2, 2 / sc);
              ctx.fillStyle = "rgba(34, 197, 94, 0.2)";
              ctx.beginPath();
              polygon.forEach(function (p, idx) {
                const x = Number(p.x) * sc;
                const y = Number(p.y) * sc;
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.restore();
            }
          }
          URL.revokeObjectURL(srcUrl);
          c.toBlob(
            function (out) {
              if (!out) {
                resolve(URL.createObjectURL(blob));
                return;
              }
              resolve(URL.createObjectURL(out));
            },
            "image/png",
            0.9
          );
        } catch (e) {
          try {
            URL.revokeObjectURL(srcUrl);
          } catch (e2) {}
          resolve(URL.createObjectURL(blob));
        }
      };
      im.onerror = function () {
        try {
          URL.revokeObjectURL(srcUrl);
        } catch (e) {}
        resolve(null);
      };
      im.src = srcUrl;
    });
  }

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onerror = function () {
        reject(req.error);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
    });
  }

  function idbPutBlob(recordId, blob) {
    if (!recordId || !blob) return Promise.resolve();
    return idbOpen().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(blob, recordId);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function idbGetBlob(recordId) {
    if (!recordId) return Promise.resolve(null);
    return idbOpen().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(recordId);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function idbDeleteBlob(recordId) {
    if (!recordId) return Promise.resolve();
    return idbOpen().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(recordId);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function getImageBlobFromCurrentView() {
    return new Promise(function (resolve) {
      if (!imgEl || !imgEl.naturalWidth) {
        resolve(null);
        return;
      }
      try {
        const c = document.createElement("canvas");
        c.width = imgEl.naturalWidth;
        c.height = imgEl.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(imgEl, 0, 0);
        c.toBlob(
          function (blob) {
            resolve(blob);
          },
          "image/png",
          0.92
        );
      } catch (e) {
        resolve(null);
      }
    });
  }

  function showManageView() {
    $("view-manage").style.display = "";
    $("view-editor").style.display = "none";
    clearCloneChainNotice();
  }

  function showEditorView() {
    $("view-manage").style.display = "none";
    $("view-editor").style.display = "";
    requestAnimationFrame(function () {
      syncDrawCanvasSize();
    });
    updateLineBatchSaveUI();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function repopFovOptions() {
    const sel = $("fov-select");
    if (!sel) return;
    const v = sel.value;
    while (sel.options.length) sel.remove(0);
    const p0 = document.createElement("option");
    p0.value = "";
    p0.textContent = tr("pxmm_fovPlh");
    sel.appendChild(p0);
    FOVS.forEach(function (f) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = fovDisplay(f);
      sel.appendChild(o);
    });
    var has = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === v) {
        has = true;
        break;
      }
    }
    sel.value = has ? v : "";
  }

  function onPxmmLocale() {
    if (TI) TI.refreshAll();
    const imgW = $("work-image");
    if (imgW) imgW.setAttribute("alt", tr("pxmm_workImg"));
    const dseg = $("pxmm-draw-seg");
    if (dseg) dseg.setAttribute("aria-label", tr("pxmm_ariaMode"));
    const stripA = $("line-preview-strip");
    if (stripA) stripA.setAttribute("aria-label", tr("pxmm_ariaThumbs"));
    const stog = $("pxmm-source-toggles-aria");
    if (stog) stog.setAttribute("aria-label", tr("pxmm_sourceLabel"));
    const cfc0 = $("clone-fov-checks");
    if (cfc0) cfc0.setAttribute("aria-label", tr("pxmm_ariaCloneFov"));
    const ug = $("pxmm-user-guide");
    if (ug) ug.setAttribute("aria-label", tr("pxmm_guideH2"));
    const lq = $("line-queue");
    if (lq) lq.setAttribute("aria-label", tr("pxmm_lblQueue"));
    const cm0 = $("calib-metric");
    if (cm0) cm0.setAttribute("aria-label", tr("pxmm_thMetric"));
    const mk = $("calib-metric") && $("calib-metric").value;
    repopFovOptions();
    renderManageList();
    updateImageSourceUI();
    if (lineImageQueue && lineImageQueue.length) {
      populateLineQueueSelect();
      renderLinePreviewThumbs(lineQueueLastIndex);
      updateLineProgressAndNav(lineQueueLastIndex);
    }
    updateMetricSelectPreferred(mk);
    updateDrawingToolButtons();
    updateStats();
    var eid = ($("edit-record-id") && ($("edit-record-id").value || "").trim());
    if ($("btn-save-calib")) {
      $("btn-save-calib").textContent = eid ? tr("pxmm_saveUpd") : tr("pxmm_save");
    }
    updateCalibPreview();
    if (cloneSourceId) {
      openCloneDialog(cloneSourceId);
    }
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 多边形面积（像素²），顶点顺序可为顺时针或逆时针 */
  function polygonAreaPx2(pts) {
    if (pts.length < 3) return 0;
    let s = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(s / 2);
  }

  /** 闭合多边形几何质心（非顶点），坐标系：左上角为 (0,0) */
  function polygonCentroidClosed(pts) {
    const n = pts.length;
    if (n < 1) return null;
    if (n === 1) return { x: pts[0].x, y: pts[0].y };
    if (n === 2) {
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
    let twice = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      twice += c;
      cx += (pts[i].x + pts[j].x) * c;
      cy += (pts[i].y + pts[j].y) * c;
    }
    if (Math.abs(twice) < 1e-9) {
      let sx = 0;
      let sy = 0;
      pts.forEach(function (p) {
        sx += p.x;
        sy += p.y;
      });
      return { x: sx / n, y: sy / n };
    }
    return { x: cx / (3 * twice), y: cy / (3 * twice) };
  }

  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function convexHull(points) {
    if (points.length <= 1) return points.slice();
    const pts = points
      .slice()
      .sort(function (a, b) {
        return a.x === b.x ? a.y - b.y : a.x - b.x;
      });
    const lower = [];
    pts.forEach(function (p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    });
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  /** 凸包上的最小面积外接矩形，返回 { lengthPx, widthPx }，长为较长边（像素） */
  function minAreaBoundingRectPx(hullPts) {
    if (hullPts.length === 0) return { lengthPx: 0, widthPx: 0 };
    if (hullPts.length === 1) return { lengthPx: 0, widthPx: 0 };
    if (hullPts.length === 2) {
      const d = dist(hullPts[0], hullPts[1]);
      return { lengthPx: d, widthPx: 0 };
    }
    const hull = hullPts;
    const n = hull.length;
    let bestArea = Infinity;
    let bestW = 0;
    let bestH = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = hull[j].x - hull[i].x;
      const dy = hull[j].y - hull[i].y;
      const ang = Math.atan2(dy, dx);
      const c = Math.cos(-ang);
      const s = Math.sin(-ang);
      let minx = Infinity;
      let miny = Infinity;
      let maxx = -Infinity;
      let maxy = -Infinity;
      hull.forEach(function (p) {
        const rx = p.x * c - p.y * s;
        const ry = p.x * s + p.y * c;
        minx = Math.min(minx, rx);
        maxx = Math.max(maxx, rx);
        miny = Math.min(miny, ry);
        maxy = Math.max(maxy, ry);
      });
      const w = maxx - minx;
      const h = maxy - miny;
      const area = w * h;
      if (area > 0 && area < bestArea) {
        bestArea = area;
        bestW = w;
        bestH = h;
      }
    }
    if (!(bestArea < Infinity) || bestW <= 0 || bestH <= 0) {
      let ax = Infinity;
      let ay = Infinity;
      let bx = -Infinity;
      let by = -Infinity;
      hullPts.forEach(function (p) {
        ax = Math.min(ax, p.x);
        ay = Math.min(ay, p.y);
        bx = Math.max(bx, p.x);
        by = Math.max(by, p.y);
      });
      bestW = bx - ax;
      bestH = by - ay;
    }
    const L = Math.max(bestW, bestH);
    const W = Math.min(bestW, bestH);
    return { lengthPx: L, widthPx: W };
  }

  function isShapeCompleteForCurrentTool() {
    if (!closed) return false;
    if (drawTool === "poly") return vertices.length >= 3;
    if (drawTool === "line" || drawTool === "rect" || drawTool === "circle") {
      return vertices.length >= 2;
    }
    return false;
  }

  function recomputeLastMetrics() {
    if (!isShapeCompleteForCurrentTool() || !closed) {
      lastMetrics = null;
      return;
    }
    if (drawTool === "line") {
      if (vertices.length < 2) {
        lastMetrics = null;
        return;
      }
      lastMetrics = { seg_len: dist(vertices[0], vertices[1]) };
      return;
    }
    if (drawTool === "rect" && vertices.length >= 2) {
      const x1 = vertices[0].x;
      const y1 = vertices[0].y;
      const x2 = vertices[1].x;
      const y2 = vertices[1].y;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      const a = w * h;
      const d = Math.sqrt(w * w + h * h);
      lastMetrics = { rect_w: w, rect_h: h, rect_area: a, area: a, rect_diag: d };
      return;
    }
    if (drawTool === "circle" && vertices.length >= 2) {
      const r = dist(vertices[0], vertices[1]);
      const a = Math.PI * r * r;
      const c = 2 * Math.PI * r;
      lastMetrics = {
        circ_r: r,
        circ_d: 2 * r,
        circ_c: c,
        circ_a: a,
        area: a,
      };
      return;
    }
    if (drawTool === "poly" && vertices.length >= 3) {
      const a = polygonAreaPx2(vertices);
      const hull = convexHull(vertices);
      const rect = minAreaBoundingRectPx(hull);
      lastMetrics = {
        area: a,
        mr_len: rect.lengthPx,
        mr_wid: rect.widthPx,
      };
    }
  }

  function metricIsAreaKey(key) {
    return key === "area" || key === "rect_area" || key === "circ_a";
  }

  function getMetricOptionsForTool(tool) {
    if (tool === "line") return ["seg_len"];
    if (tool === "rect") return ["rect_w", "rect_h", "rect_area", "rect_diag", "area"];
    if (tool === "circle") return ["circ_r", "circ_d", "circ_c", "circ_a", "area"];
    return ["area", "mr_len", "mr_wid"];
  }

  function updateMetricSelectPreferred(preferredKey) {
    const sel = $("calib-metric");
    if (!sel) return;
    const keys = getMetricOptionsForTool(drawTool);
    const opts = keys.map(function (k) {
      return { value: k, label: metricLabel(k) || k };
    });
    sel.innerHTML = opts
      .map(function (o) {
        return '<option value="' + o.value.replace(/"/g, "&quot;") + '">' + o.label + "</option>";
      })
      .join("");
    let setTo = keys[0];
    if (preferredKey && keys.indexOf(preferredKey) >= 0) {
      setTo = preferredKey;
    } else if (preferredKey === "center_x" || preferredKey === "center_y") {
      if (drawTool === "line") setTo = "seg_len";
      else if (drawTool === "rect") setTo = "rect_area";
      else if (drawTool === "circle") setTo = "circ_a";
      else setTo = "area";
    }
    sel.value = setTo;
    updateCalibPreview();
  }

  function updateDrawingToolButtons() {
    document.querySelectorAll("[data-draw-tool]").forEach(function (btn) {
      const t = btn.getAttribute("data-draw-tool");
      if (t === drawTool) btn.classList.add("is-active");
      else btn.classList.remove("is-active");
    });
    const closeBtn = $("btn-close-poly");
    if (closeBtn) {
      const show = drawTool === "poly";
      closeBtn.style.display = show ? "" : "none";
      closeBtn.setAttribute("aria-hidden", show ? "false" : "true");
    }
    const hint = $("pxmm-drawing-hint");
    if (hint) {
      if (drawTool === "poly") {
        hint.textContent = tr("pxmm_hintDraw");
      } else if (drawTool === "line") {
        hint.textContent = tr("pxmm_hintLine");
      } else if (drawTool === "rect") {
        hint.textContent = tr("pxmm_hintRect");
      } else {
        hint.textContent = tr("pxmm_hintCircle");
      }
    }
  }

  function setDrawTool(next) {
    if (next === drawTool) return;
    if (vertices.length > 0 && !confirm(tr("pxmm_confirmSwitchTool"))) return;
    drawTool = next;
    vertices = [];
    closed = false;
    lastMetrics = null;
    updateMetricSelectPreferred(null);
    updateDrawingToolButtons();
    markLineSessionDirty();
    redrawOverlay();
    updateStats();
  }

  function getImageLayout() {
    if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) return null;
    const rect = imgEl.getBoundingClientRect();
    const scaleX = rect.width / imgEl.naturalWidth;
    const scaleY = rect.height / imgEl.naturalHeight;
    return { rectW: rect.width, rectH: rect.height, scaleX: scaleX, scaleY: scaleY };
  }

  function clientToImageCoords(clientX, clientY) {
    if (!imgEl) return null;
    const r = imgEl.getBoundingClientRect();
    const lx = clientX - r.left;
    const ly = clientY - r.top;
    const lay = getImageLayout();
    if (!lay) return null;
    if (lx < 0 || ly < 0 || lx > lay.rectW || ly > lay.rectH) return null;
    return {
      x: lx / lay.scaleX,
      y: ly / lay.scaleY,
    };
  }

  function syncDrawCanvasSize() {
    if (!imgEl || !drawCanvas) return;
    const lay = getImageLayout();
    if (!lay) return;
    drawCanvas.width = Math.round(lay.rectW);
    drawCanvas.height = Math.round(lay.rectH);
    drawCanvas.style.width = lay.rectW + "px";
    drawCanvas.style.height = lay.rectH + "px";
    redrawOverlay();
  }

  function drawVertexHandle(px, py, color) {
    if (!drawCtx) return;
    const fill = color || "#22c55e";
    drawCtx.beginPath();
    drawCtx.arc(px, py, 6, 0, Math.PI * 2);
    drawCtx.fillStyle = fill;
    drawCtx.fill();
    drawCtx.strokeStyle = "#ffffff";
    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  }

  function redrawOverlay() {
    if (!drawCtx || !drawCanvas) return;
    const lay = getImageLayout();
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    if (!lay || vertices.length === 0) return;
    const sx = lay.scaleX;
    const sy = lay.scaleY;
    const n = vertices.length;
    drawCtx.save();
    drawCtx.lineJoin = "round";
    drawCtx.lineCap = "round";
    drawCtx.strokeStyle = "#16a34a";
    drawCtx.lineWidth = 3;
    var i = 0;

    if (drawTool === "line") {
      if (n === 1) {
        drawVertexHandle(vertices[0].x * sx, vertices[0].y * sy, "#22c55e");
      } else if (n >= 2) {
        drawCtx.beginPath();
        drawCtx.moveTo(vertices[0].x * sx, vertices[0].y * sy);
        drawCtx.lineTo(vertices[1].x * sx, vertices[1].y * sy);
        drawCtx.stroke();
        drawVertexHandle(vertices[0].x * sx, vertices[0].y * sy, "#22c55e");
        drawVertexHandle(vertices[1].x * sx, vertices[1].y * sy, "#22c55e");
      }
      drawCtx.restore();
      return;
    }

    if (drawTool === "rect") {
      if (n === 1) {
        drawVertexHandle(vertices[0].x * sx, vertices[0].y * sy, "#22c55e");
        drawCtx.restore();
        return;
      }
      const x1 = vertices[0].x * sx;
      const y1 = vertices[0].y * sy;
      const x2 = vertices[1].x * sx;
      const y2 = vertices[1].y * sy;
      const l = Math.min(x1, x2);
      const t = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (closed) {
        drawCtx.fillStyle = "rgba(34, 197, 94, 0.18)";
        drawCtx.fillRect(l, t, w, h);
      }
      drawCtx.strokeRect(l, t, w, h);
      drawVertexHandle(vertices[0].x * sx, vertices[0].y * sy, "#22c55e");
      drawVertexHandle(vertices[1].x * sx, vertices[1].y * sy, "#22c55e");
      drawCtx.restore();
      return;
    }

    if (drawTool === "circle") {
      if (n === 1) {
        drawVertexHandle(vertices[0].x * sx, vertices[0].y * sy, "#0ea5e9");
        drawCtx.restore();
        return;
      }
      const cx = vertices[0].x * sx;
      const cy = vertices[0].y * sy;
      const pr = dist(vertices[0], vertices[1]);
      const rad = pr * 0.5 * (sx + sy);
      drawCtx.beginPath();
      drawCtx.arc(cx, cy, Math.max(1, rad), 0, Math.PI * 2);
      if (closed) {
        drawCtx.fillStyle = "rgba(34, 197, 94, 0.16)";
        drawCtx.fill();
      }
      drawCtx.stroke();
      drawVertexHandle(vertices[0].x * sx, vertices[0].y * sy, "#0ea5e9");
      drawVertexHandle(vertices[1].x * sx, vertices[1].y * sy, "#22c55e");
      drawCtx.restore();
      return;
    }

    /* 多边形 */
    drawCtx.beginPath();
    for (i = 0; i < n; i++) {
      const x = vertices[i].x * sx;
      const y = vertices[i].y * sy;
      if (i === 0) drawCtx.moveTo(x, y);
      else drawCtx.lineTo(x, y);
    }
    if (closed && n >= 3) {
      drawCtx.closePath();
      drawCtx.fillStyle = "rgba(34, 197, 94, 0.18)";
      drawCtx.fill();
    }
    if (n >= 2) {
      drawCtx.stroke();
    }
    for (i = 0; i < n; i++) {
      drawVertexHandle(vertices[i].x * sx, vertices[i].y * sy, "#22c55e");
    }
    drawCtx.restore();
  }

  function tryClosePolygon(fromRightClick) {
    if (closed) return;
    if (drawTool !== "poly") {
      if (fromRightClick) {
        alert("仅多边形支持右键闭合；直线/矩形/圆请用两次点击完成。");
      }
      return;
    }
    if (vertices.length < 3) {
      if (fromRightClick) {
        alert("至少需要 3 个顶点才能闭合多边形。");
      }
      return;
    }
    closed = true;
    markLineSessionDirty();
    redrawOverlay();
    updateStats();
  }

  function fmt(n) {
    if (n == null || Number.isNaN(n)) return "-";
    return Number(n).toFixed(2).replace(/\.?0+$/, "");
  }

  function updateStats() {
    const el = $("stat-panel");
    if (!el) return;
    recomputeLastMetrics();
    if (!isShapeCompleteForCurrentTool() || !lastMetrics) {
      const key =
        drawTool === "poly"
          ? "pxmm_stat_incomplete_poly"
          : drawTool === "line"
            ? "pxmm_stat_incomplete_line"
            : drawTool === "rect"
              ? "pxmm_stat_incomplete_rect"
              : "pxmm_stat_incomplete_circle";
      el.innerHTML =
        "<p class=\"pxmm-stat\" style=\"margin:0;color:var(--text-secondary);\">" + tr(key) + "</p>";
      updateCalibPreview();
      return;
    }
    const rows = [];
    if (drawTool === "line") {
      rows.push(['<dt>' + tr("pxmm_statdt_seg") + "</dt><dd>", "seg_len", "</dd>"]);
    } else if (drawTool === "rect") {
      rows.push(['<dt>' + tr("pxmm_statdt_rectw") + "</dt><dd>", "rect_w", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_recth") + "</dt><dd>", "rect_h", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_recta") + "</dt><dd>", "rect_area", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_rectd") + "</dt><dd>", "rect_diag", "</dd>"]);
    } else if (drawTool === "circle") {
      rows.push(['<dt>' + tr("pxmm_statdt_cr") + "</dt><dd>", "circ_r", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_cd") + "</dt><dd>", "circ_d", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_cc") + "</dt><dd>", "circ_c", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_ca") + "</dt><dd>", "circ_a", "</dd>"]);
    } else {
      rows.push(['<dt>' + tr("pxmm_statdt_polya") + "</dt><dd>", "area", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_mrl") + "</dt><dd>", "mr_len", "</dd>"]);
      rows.push(['<dt>' + tr("pxmm_statdt_mrw") + "</dt><dd>", "mr_wid", "</dd>"]);
    }
    const parts = rows
      .map(function (r) {
        return r[0] + fmt(lastMetrics[r[1]]) + r[2];
      })
      .join("");
    el.innerHTML = "<dl class=\"pxmm-stat\">" + parts + "</dl>";
    updateCalibPreview();
  }

  function getSelectedPxValue() {
    if (!lastMetrics) return null;
    const key = $("calib-metric").value;
    const v = lastMetrics[key];
    if (v != null && Number.isFinite(v)) return v;
    return null;
  }

  function getPreviewPxValue() {
    const editId = $("edit-record-id") && $("edit-record-id").value.trim();
    const wrap = $("calib-px-wrap");
    if (editId && wrap && wrap.style.display !== "none") {
      const pxStr = ($("calib-px").value || "").trim().replace(",", ".");
      const v = parseFloat(pxStr);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return getSelectedPxValue();
  }

  function updateCalibPreview() {
    const out = $("calib-result");
    if (!out) return;
    const mmStr = ($("calib-mm").value || "").trim().replace(",", ".");
    const mm = parseFloat(mmStr);
    const px = getPreviewPxValue();
    if (px == null || px <= 0 || !Number.isFinite(mm)) {
      out.innerHTML = tr("pxmm_prev_empty");
      return;
    }
    const metric = $("calib-metric").value;
    if (metricIsAreaKey(metric)) {
      const mm2PerPx2 = mm / (px * px);
      out.innerHTML = trFmt("pxmm_prev_area", { px: fmt(px), mm: fmt(mm), r: fmt(mm2PerPx2) });
    } else {
      const mmPerPx = mm / px;
      out.innerHTML = trFmt("pxmm_prev_len", { px: fmt(px), mm: fmt(mm), r: fmt(mmPerPx) });
    }
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(LS_RECORDS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function persistRecords(list) {
    localStorage.setItem(LS_RECORDS_KEY, JSON.stringify(list));
  }

  function migrateOldStorage() {
    if (!localStorage.getItem(LS_RECORDS_KEY) && localStorage.getItem(LS_LEGACY_ARRAY_KEY)) {
      try {
        localStorage.setItem(LS_RECORDS_KEY, localStorage.getItem(LS_LEGACY_ARRAY_KEY));
        localStorage.removeItem(LS_LEGACY_ARRAY_KEY);
      } catch (e) {}
    }
    if (localStorage.getItem(LS_RECORDS_KEY)) return;
    const migrated = [];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LS_OLD_PREFIX)) continue;
      if (key === LS_RECORDS_KEY || key === LS_LEGACY_ARRAY_KEY) continue;
      let parsedFov = null;
      let parsedMetric = null;
      for (let m = 0; m < METRIC_KEYS.length; m++) {
        const metric = METRIC_KEYS[m];
        const suf = "_" + metric;
        if (key.endsWith(suf)) {
          parsedMetric = metric;
          parsedFov = key.slice(LS_OLD_PREFIX.length, -suf.length);
          break;
        }
      }
      if (!parsedFov || !parsedMetric) continue;
      try {
        const obj = JSON.parse(localStorage.getItem(key));
        if (obj && typeof obj === "object") {
          migrated.push({
            id: "mig_" + key.replace(/[^a-zA-Z0-9]/g, "_"),
            fov: obj.fov || parsedFov,
            metric: obj.metric || parsedMetric,
            pxValue: Number(obj.pxValue),
            mmValue: Number(obj.mmValue),
            savedAt: obj.savedAt || new Date().toISOString(),
          });
          keysToRemove.push(key);
        }
      } catch (e) {}
    }
    if (migrated.length) {
      persistRecords(migrated);
    } else {
      persistRecords([]);
    }
    keysToRemove.forEach(function (k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
  }

  function formatSavedAt(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0") +
        " " +
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0")
      );
    } catch (e) {
      return iso;
    }
  }

  function renderManageList() {
    const tbody = $("manage-body");
    if (!tbody) return;
    revokeThumbUrls();
    const list = loadRecords().sort(function (a, b) {
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-secondary);">' +
        escapeHtml(tr("pxmm_emptyList")) +
        "</td></tr>";
      return;
    }
    tbody.innerHTML = list
      .map(function (r) {
        const isAreaM = r.metric && metricIsAreaKey(r.metric);
        const unit = isAreaM ? "mm²" : "mm";
        const pxUnit = isAreaM ? "px²" : "px";
        return (
          "<tr data-rec-id=\"" +
          escapeHtml(r.id) +
          "\">" +
          '<td class="col-thumb"><img class="pxmm-thumb" alt="" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid var(--border);background:#f5f5f5" /></td>' +
          "<td class=\"pxmm-fov-cell\">" +
          (function () {
            var rowFov = r.fov || "";
            var t = "<span class=\"pxmm-fov-name\">" + escapeHtml(fovDisplay(rowFov)) + "</span>";
            if (r.cloneOf) {
              const src0 = list.find(function (x) {
                return x.id === r.cloneOf;
              });
              const srcF = src0 ? src0.fov : null;
              const srcDisp = srcF != null ? fovDisplay(srcF) : tr("pxmm_sourceDeleted");
              t +=
                "<div class=\"pxmm-clone-line\"><span class=\"pxmm-clone-pill\" title=\"" +
                escapeHtml(tr("pxmm_chainPillTitle")) +
                "\">" +
                escapeHtml(tr("pxmm_chainFrom")) +
                escapeHtml(srcDisp) +
                "</span></div>";
            }
            return t;
          })() +
          "</td>" +
          "<td>" +
          escapeHtml(metricLabel(r.metric) || r.metric) +
          "</td>" +
          "<td>" +
          escapeHtml(fmt(r.pxValue)) +
          " " +
          pxUnit +
          "</td>" +
          "<td>" +
          escapeHtml(fmt(r.mmValue)) +
          " " +
          unit +
          "</td>" +
          "<td>" +
          escapeHtml(formatSavedAt(r.savedAt)) +
          "</td>" +
          '<td><div class="cell-inner" style="justify-content:center;flex-wrap:wrap;gap:2px 6px;max-width:220px">' +
          '<button type="button" class="text-btn btn-manage-edit">' +
          escapeHtml(tr("pxmm_op_edit")) +
          "</button>" +
          '<button type="button" class="text-btn btn-manage-clone">' +
          escapeHtml(tr("pxmm_op_clone")) +
          "</button>" +
          '<button type="button" class="text-btn danger btn-manage-del">' +
          escapeHtml(tr("pxmm_op_delete")) +
          "</button>" +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
    const imgs = tbody.querySelectorAll(".pxmm-thumb");
    list.forEach(function (r, i) {
      const img = imgs[i];
      if (!img) return;
      idbGetBlob(r.id).then(function (blob) {
        if (!blob) {
          img.alt = tr("pxmm_altNoRef");
          return;
        }
        buildThumbObjectUrl(blob, r.polygon, r.drawTool).then(function (u) {
          if (!u) {
            img.alt = tr("pxmm_altNoRef");
            return;
          }
          thumbObjectUrls.push(u);
          img.src = u;
          const dt = r.drawTool || (r.polygon && r.polygon.length === 2 ? "line" : "poly");
          const minP = minPolyPointsForTool(dt);
          img.alt = r.polygon && r.polygon.length >= minP ? tr("pxmm_altRefCalib") : tr("pxmm_workImg");
        });
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function copyPolygonForClone(poly, dTool) {
    const t = dTool || (poly && poly.length === 2 ? "line" : "poly");
    if (!Array.isArray(poly) || poly.length < minPolyPointsForTool(t)) return null;
    return poly.map(function (p) {
      return { x: Number(p.x), y: Number(p.y) };
    });
  }

  function openCloneDialog(id) {
    const list = loadRecords();
    const rec = list.find(function (x) {
      return x.id === id;
    });
    if (!rec) return;
    cloneSourceId = id;
    const desc = $("clone-source-desc");
    if (desc) {
      desc.textContent =
        tr("pxmm_cloneSourcePrefix") +
        fovDisplay(rec.fov || "—") +
        " · " +
        (metricLabel(rec.metric) || rec.metric) +
        " " +
        trFmt("pxmm_cloneSourceTail", { px: fmt(rec.pxValue), mm: fmt(rec.mmValue) });
    }
    const box = $("clone-fov-checks");
    if (box) {
      const targets = FOVS.filter(function (f) {
        return f !== rec.fov;
      });
      box.innerHTML = targets
        .map(function (fov) {
          return (
            "<label class=\"pxmm-clone-label\"><input type=\"checkbox\" name=\"clone-fov\" value=\"" +
            fov.replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
            "\" /> " +
            escapeHtml(fovDisplay(fov)) +
            "</label>"
          );
        })
        .join("");
    }
    const h = $("clone-skip-hint");
    if (h) h.style.display = "block";
    const dlg = $("pxmm-clone-dialog");
    if (dlg) {
      dlg.style.display = "flex";
      dlg.removeAttribute("hidden");
    }
  }

  function closeCloneDialog() {
    cloneSourceId = null;
    const dlg = $("pxmm-clone-dialog");
    if (dlg) {
      dlg.style.display = "none";
      dlg.setAttribute("hidden", "true");
    }
  }

  function applyClone() {
    if (!cloneSourceId) return;
    const list = loadRecords();
    const src = list.find(function (x) {
      return x.id === cloneSourceId;
    });
    if (!src) {
      closeCloneDialog();
      return;
    }
    const box = $("clone-fov-checks");
    const selected = box ? box.querySelectorAll("input[name=\"clone-fov\"]:checked") : [];
    const fovs = [];
    selected.forEach(function (c) {
      fovs.push(c.value);
    });
    if (fovs.length === 0) {
      alert("请至少勾选一个目标视野。");
      return;
    }
    const poly = copyPolygonForClone(src.polygon, src.drawTool);
    if (!poly) {
      alert("源记录的标定图形不完整，无法克隆。请先编辑源并保证已保存有效的标定点。");
      return;
    }
    const now = new Date().toISOString();
    const t0 = Date.now();
    idbGetBlob(cloneSourceId).then(function (blob) {
      fovs.forEach(function (targetFov, i) {
        const found = list.findIndex(function (x) {
          return x.fov === targetFov && x.metric === src.metric;
        });
        if (found >= 0) {
          const oldId = list[found].id;
          list[found] = {
            id: oldId,
            fov: targetFov,
            metric: src.metric,
            pxValue: src.pxValue,
            mmValue: src.mmValue,
            savedAt: now,
            polygon: poly,
            drawTool: src.drawTool || "poly",
            cloneOf: src.id,
          };
        } else {
          const nid = "c" + t0 + "_" + i + "_" + Math.floor(Math.random() * 10000);
          list.push({
            id: nid,
            fov: targetFov,
            metric: src.metric,
            pxValue: src.pxValue,
            mmValue: src.mmValue,
            savedAt: now,
            polygon: poly,
            drawTool: src.drawTool || "poly",
            cloneOf: src.id,
          });
        }
      });
      if (!blob) {
        try {
          persistRecords(list);
        } catch (e) {
          alert("无法保存。");
          return;
        }
        closeCloneDialog();
        renderManageList();
        alert("已更新 " + fovs.length + " 个目标视野的数值；未复用源参考图（无图像数据）。");
        return;
      }
      const puts = fovs.map(function (targetFov) {
        const r = list.find(function (x) {
          return x.fov === targetFov && x.metric === src.metric;
        });
        if (!r) return Promise.resolve();
        return idbPutBlob(r.id, blob);
      });
      return Promise.all(puts).then(function () {
        try {
          persistRecords(list);
        } catch (e) {
          alert("无法保存。");
          return;
        }
        closeCloneDialog();
        renderManageList();
        alert("已克隆到 " + fovs.length + " 个目标视野。");
      });
    }).catch(function () {
      alert("读取或写入参考图时出错，未应用克隆。");
    });
  }

  function clearCloneChainNotice() {
    const el = $("pxmm-clone-edit-notice");
    if (el) {
      el.style.display = "none";
      el.setAttribute("hidden", "true");
      el.innerHTML = "";
    }
  }

  function updateCloneChainNotice(rec) {
    const el = $("pxmm-clone-edit-notice");
    if (!el) return;
    if (rec && rec.cloneOf) {
      const list = loadRecords();
      const src = list.find(function (x) {
        return x.id === rec.cloneOf;
      });
      const srcFov = src && src.fov ? fovDisplay(src.fov) : tr("pxmm_sourceDeleted");
      el.style.display = "block";
      el.removeAttribute("hidden");
      const rowFovL = rec.fov ? fovDisplay(rec.fov) : tr("pxmm_fovThis");
      el.innerHTML =
        "<div class=\"pxmm-clone-notice-body\">" +
        "<p class=\"pxmm-clone-edit-p\">本行 <strong class=\"pxmm-hl\">" +
        escapeHtml(rowFovL) +
        "</strong> 由 <strong class=\"pxmm-hl\">" +
        escapeHtml(srcFov) +
        "</strong> 链出。您可在当前页面<strong>下方「图像来源」</strong>为<strong>本视野</strong>重新选图/换图、重新绘制多边形；保存后将成为<strong>本视野的独立标定</strong>并不再显示「链自」。</p>" +
        (src
          ? "<p class=\"pxmm-clone-edit-p pxmm-clone-p-actions\"><button type=\"button\" class=\"btn btn-outline btn-sm\" id=\"btn-open-clone-source\" data-clone-source-id=\"" +
            String(src.id)
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;") +
            "\">仅打开源标定</button><span class=\"pxmm-clone-btn-hint\"> 修改源会同步到未独立保存的链出行。</span></p>"
          : "") +
        "</div>";
    } else {
      clearCloneChainNotice();
    }
  }

  function beginEditRecord(id, opts) {
    opts = opts || {};
    const list = loadRecords();
    const rec = list.find(function (x) {
      return x.id === id;
    });
    if (!rec) return;
    revokeLineQueue();
    showEditorView();
    if (opts.fromSourceButton) {
      setSourcePanelVisible(false);
    } else {
      /* 编辑时始终可换参考图，故显示图像来源与「本地上传」；链出行原有说明仍适用 */
      setSourcePanelVisible(true);
    }
    $("edit-record-id").value = rec.id;
    $("fov-select").value = rec.fov || "";
    $("calib-metric").value = rec.metric || "area";
    $("calib-mm").value = String(rec.mmValue != null ? rec.mmValue : "");
    $("calib-px-wrap").style.display = "block";
    $("calib-px").value = String(rec.pxValue != null ? rec.pxValue : "");
    $("btn-cancel-edit").style.display = "inline-block";
    $("btn-save-calib").textContent = tr("pxmm_saveUpd");
    if (!opts.fromSourceButton) {
      updateCloneChainNotice(rec);
    } else {
      clearCloneChainNotice();
    }
    if (!opts.fromSourceButton) {
      setImageSourceMode("manual", true);
      if ($("pxmm-source-manual")) $("pxmm-source-manual").checked = true;
      if ($("pxmm-source-line")) $("pxmm-source-line").checked = false;
      if ($("file-image-line")) $("file-image-line").value = "";
      if ($("file-image-manual")) $("file-image-manual").value = "";
      setLineFovDisplay("—");
      updateImageSourceUI();
    }
    idbGetBlob(rec.id).then(function (blob) {
      const toolGuess =
        rec.drawTool || (rec.polygon && rec.polygon.length === 2 ? "line" : "poly");
      const minN = minPolyPointsForTool(toolGuess);
      const poly =
        rec.polygon && Array.isArray(rec.polygon) && rec.polygon.length >= minN
          ? rec.polygon.map(function (p) {
              return { x: Number(p.x), y: Number(p.y) };
            })
          : null;
      const rtool = poly ? toolGuess : (rec.drawTool || "poly");
      const o = {
        restorePolygon: poly,
        restoreDrawTool: rtool,
        restoreMetricKey: rec.metric,
        afterLoad: function () {
          updateCalibPreview();
          updateLineBatchSaveUI();
        },
      };
      if (blob) {
        setImageFromUrl(URL.createObjectURL(blob), o);
      } else {
        setImageFromUrl(makeSampleDataUrl(0), o);
      }
    });
  }

  function cancelEditRecord() {
    $("edit-record-id").value = "";
    $("calib-px-wrap").style.display = "none";
    $("calib-px").value = "";
    $("btn-cancel-edit").style.display = "none";
    $("btn-save-calib").textContent = tr("pxmm_save");
    setSourcePanelVisible(true);
    clearCloneChainNotice();
    updateCalibPreview();
    updateLineBatchSaveUI();
  }

  function saveCalib(opts) {
    opts = opts || {};
    const fov = getCurrentFovForSave();
    const mmStr = ($("calib-mm").value || "").trim().replace(",", ".");
    const mm = parseFloat(mmStr);
    const metric = $("calib-metric").value;
    const editId = ($("edit-record-id").value || "").trim();

    if (!fov) {
      if (editId) {
        alert("请保留有效的视野信息。");
      } else if (getImageSourceMode() === "line" && !lineImageQueue.length) {
        alert("请先从产线数据导入带视野的图像，并在多图中选择当前要标定的一张。");
      } else {
        alert("本地上传图像时，请先选择对应的视野；产线数据导入后视野由产线随图附带的元数据决定。");
      }
      return;
    }
    if (!Number.isFinite(mm)) {
      alert("请填写有效的毫米值（面积请填 mm² 数值）。");
      return;
    }

    let px = getPreviewPxValue();
    if (editId) {
      const pxStr = ($("calib-px").value || "").trim().replace(",", ".");
      px = parseFloat(pxStr);
      if (!Number.isFinite(px) || px <= 0) {
        alert("请填写有效的像素量。");
        return;
      }
    } else {
      if (!lastMetrics || px == null || px <= 0) {
        alert("请先按当前方式完成标定（闭合多边形/两点定直线/矩形/圆）并填写有效毫米值，或从管理进入「编辑」以手工改像素量。");
        return;
      }
    }

    const list = loadRecords();
    if (editId) {
      const recBefore = list.find(function (r) {
        return r.id === editId;
      });
      if (recBefore && recBefore.cloneOf) {
        if (
          !confirm(
            "本记录由其他视野的标定「链出」。保存后将成为本视野的独立标定（含当前画布上的图像与多边形），并解除与源的关系（列表中不再显示「链自」）。确定保存吗？"
          )
        ) {
          return;
        }
      }
    }
    const now = new Date().toISOString();
    const recordId = editId || "c" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const polygon = getPolygonForSave(editId, list);

    if (editId) {
      const idx = list.findIndex(function (r) {
        return r.id === editId;
      });
      if (idx < 0) {
        alert("记录不存在或已被删除。");
        cancelEditRecord();
        return;
      }
      list[idx] = {
        id: recordId,
        fov: fov,
        metric: metric,
        pxValue: px,
        mmValue: mm,
        savedAt: now,
        polygon: polygon,
        drawTool: drawTool,
      };
      for (var syncI = 0; syncI < list.length; syncI++) {
        if (list[syncI].cloneOf === recordId) {
          list[syncI] = {
            id: list[syncI].id,
            fov: list[syncI].fov,
            cloneOf: list[syncI].cloneOf,
            metric: metric,
            pxValue: px,
            mmValue: mm,
            savedAt: now,
            polygon: polygon,
            drawTool: drawTool,
          };
        }
      }
    } else {
      list.push({
        id: recordId,
        fov: fov,
        metric: metric,
        pxValue: px,
        mmValue: mm,
        savedAt: now,
        polygon: polygon,
        drawTool: drawTool,
      });
    }

    getImageBlobFromCurrentView()
      .then(function (blob) {
        if (!blob) {
          if (!window.indexedDB) {
            alert("当前浏览器不支持 IndexedDB，仅保存了数值关系，未保存图像。");
          } else {
            alert("未能导出当前图像（可能受跨域限制）。已保存数值转化关系；请尽量使用本地上传或示例图。");
          }
          return Promise.resolve();
        }
        if (editId) {
          return idbPutBlob(recordId, blob).then(function () {
            const ch = list.filter(function (r) {
              return r.cloneOf === recordId;
            });
            if (ch.length === 0) return;
            return Promise.all(
              ch.map(function (c) {
                return idbPutBlob(c.id, blob);
              })
            );
          });
        }
        return idbPutBlob(recordId, blob);
      })
      .then(function () {
        try {
          persistRecords(list);
        } catch (e) {
          alert("无法写入本地存储。");
          return;
        }
        const wantNext = opts && opts.andNext && !editId && getImageSourceMode() === "line" && lineImageQueue.length;
        if (wantNext) {
          const s = $("line-queue");
          const i = s ? parseInt(s.value, 10) || 0 : 0;
          if (i < lineImageQueue.length - 1) {
            clearLineSessionDirty();
            cancelEditRecord();
            vertices = [];
            closed = false;
            recomputeLastMetrics();
            goToLineIndex(i + 1, { skipDirtyCheck: true, keepDrawTool: true });
            renderManageList();
            showEditorView();
            setSourcePanelVisible(true);
            if ($("pxmm-source-line")) $("pxmm-source-line").checked = true;
            updateImageSourceUI();
            updateLineBatchSaveUI();
            updateCalibPreview();
            alert("本张已保存。请继续为下一张标定，或点「返回转化管理」。");
            return;
          }
        }
        cancelEditRecord();
        renderManageList();
        showManageView();
        setSourcePanelVisible(true);
        alert(editId ? "已更新毫米转化。" : "已保存毫米转化。");
      })
      .catch(function () {
        try {
          persistRecords(list);
        } catch (e2) {
          alert("保存失败。");
          return;
        }
        const wantNext2 = opts && opts.andNext && !editId && getImageSourceMode() === "line" && lineImageQueue.length;
        if (wantNext2) {
          const s2 = $("line-queue");
          const j = s2 ? parseInt(s2.value, 10) || 0 : 0;
          if (j < lineImageQueue.length - 1) {
            clearLineSessionDirty();
            cancelEditRecord();
            vertices = [];
            closed = false;
            recomputeLastMetrics();
            goToLineIndex(j + 1, { skipDirtyCheck: true, keepDrawTool: true });
            renderManageList();
            showEditorView();
            if ($("pxmm-source-line")) $("pxmm-source-line").checked = true;
            updateImageSourceUI();
            updateLineBatchSaveUI();
            return;
          }
        }
        cancelEditRecord();
        renderManageList();
        showManageView();
        setSourcePanelVisible(true);
        alert("图像写入失败，已仅保存数值关系。");
      });
  }

  function updateLineBatchSaveUI() {
    const b = $("btn-save-calib-next");
    if (!b) return;
    const isLine = getImageSourceMode() === "line" && lineImageQueue.length;
    const editing = ($("edit-record-id") && ($("edit-record-id").value || "").trim());
    b.style.display = isLine && !editing ? "" : "none";
  }

  function setImageFromUrl(url, opts) {
    opts = opts || {};
    if (!imgEl) return;
    if (currentImageObjectUrl && currentImageObjectUrl !== url) {
      if (!lineQueueHasObjectUrl(currentImageObjectUrl)) {
        try {
          URL.revokeObjectURL(currentImageObjectUrl);
        } catch (e) {}
      }
    }
    currentImageObjectUrl = String(url).indexOf("blob:") === 0 ? url : null;
    const restore = opts.restorePolygon;
    const rtool = opts.restoreDrawTool;
    const keepT = opts.keepDrawTool;
    function restoreMatchesTool(tool, ar) {
      if (!ar || !ar.length) return false;
      if (tool === "poly") return ar.length >= 3;
      if (tool === "line" || tool === "rect" || tool === "circle") return ar.length >= 2;
      return false;
    }
    imgEl.onload = function () {
      syncDrawCanvasSize();
      if (rtool) {
        drawTool = rtool;
      } else if (!keepT) {
        drawTool = "poly";
      }
      if (rtool || !keepT) {
        updateMetricSelectPreferred(null);
      }
      if (restore && restoreMatchesTool(drawTool, restore)) {
        vertices = restore.map(function (p) {
          return { x: Number(p.x), y: Number(p.y) };
        });
        closed = true;
        recomputeLastMetrics();
      } else {
        vertices = [];
        closed = false;
        lastMetrics = null;
      }
      if (typeof opts.restoreMetricKey === "string" && opts.restoreMetricKey) {
        updateMetricSelectPreferred(opts.restoreMetricKey);
      }
      updateDrawingToolButtons();
      redrawOverlay();
      updateStats();
      if (typeof opts.afterLoad === "function") {
        opts.afterLoad();
      }
    };
    imgEl.src = url;
  }

  function makeSampleDataUrl(seed) {
    const w = 800;
    const h = 600;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const hue = [200, 120, 280][seed % 3];
    g.fillStyle = "hsl(" + hue + " 18% 88%)";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "hsl(" + hue + " 40% 45%)";
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo((i * w) / 12, 0);
      g.lineTo((i * w) / 12, h);
      g.stroke();
    }
    for (let j = 0; j < 9; j++) {
      g.beginPath();
      g.moveTo(0, (j * h) / 9);
      g.lineTo(w, (j * h) / 9);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.font = "600 18px system-ui, 'Noto Sans SC', sans-serif";
    g.fillText(lineSampleText(seed, w, h), 24, 40);
    return c.toDataURL("image/png");
  }

  function bindUI() {
    migrateOldStorage();

    repopFovOptions();
    document.addEventListener("threshold:locale", onPxmmLocale);
    if (TI) {
      TI.wireLangButton();
      TI.refreshAll();
    }

    const radios = document.querySelectorAll('input[name="pxmm-image-source"]');
    radios.forEach(function (r) {
      r.addEventListener("change", onImageSourceModeChange);
    });

    $("btn-back").addEventListener("click", function () {
      window.location.href = "index.html";
    });

    $("btn-new-convert").addEventListener("click", function () {
      cancelEditRecord();
      setSourcePanelVisible(true);
      setImageSourceMode("manual", true);
      revokeLineQueue();
      if ($("file-image-line")) $("file-image-line").value = "";
      if ($("file-image-manual")) $("file-image-manual").value = "";
      setLineFovDisplay("—");
      showEditorView();
      drawTool = "poly";
      updateMetricSelectPreferred(null);
      updateDrawingToolButtons();
      clearLineSessionDirty();
      vertices = [];
      closed = false;
      lastMetrics = null;
      setImageFromUrl(makeSampleDataUrl(0));
      updateImageSourceUI();
      updateStats();
    });

    $("btn-back-manage").addEventListener("click", function () {
      revokeLineQueue();
      showManageView();
      renderManageList();
    });

    if ($("file-image-manual")) {
      $("file-image-manual").addEventListener("change", function (e) {
        if (getImageSourceMode() !== "manual") return;
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        setImageFromUrl(url, {});
      });
    }

    if ($("file-image-line")) {
      $("file-image-line").addEventListener("change", function (e) {
        if (getImageSourceMode() !== "line") return;
        rebuildLineQueueFromFiles(e.target && e.target.files);
      });
    }

    if ($("line-queue")) {
      $("line-queue").addEventListener("change", function (e) {
        const t = e.target;
        if (!t || t.value === "") return;
        loadLineImageAt(parseInt(t.value, 10));
      });
    }

    if ($("line-preview-strip")) {
      $("line-preview-strip").addEventListener("click", function (e) {
        const b = e.target.closest("button[data-line-idx]");
        if (!b) return;
        goToLineIndex(parseInt(b.getAttribute("data-line-idx"), 10), {});
      });
    }

    if ($("btn-line-prev")) {
      $("btn-line-prev").addEventListener("click", function () {
        if (getImageSourceMode() !== "line" || !lineImageQueue.length) return;
        const s = $("line-queue");
        const i = s ? parseInt(s.value, 10) || 0 : 0;
        goToLineIndex(i - 1, {});
      });
    }

    if ($("btn-line-next")) {
      $("btn-line-next").addEventListener("click", function () {
        if (getImageSourceMode() !== "line" || !lineImageQueue.length) return;
        const s = $("line-queue");
        const i = s ? parseInt(s.value, 10) || 0 : 0;
        goToLineIndex(i + 1, {});
      });
    }

    if ($("btn-line-demo")) {
      $("btn-line-demo").addEventListener("click", function () {
        if ($("pxmm-source-line")) $("pxmm-source-line").checked = true;
        if ($("pxmm-source-manual")) $("pxmm-source-manual").checked = false;
        if ($("fov-select")) $("fov-select").value = "";
        if ($("file-image-manual")) $("file-image-manual").value = "";
        if ($("file-image-line")) $("file-image-line").value = "";
        const names = [FOVS[0] + "_产线样例1.png", FOVS[1] + "_产线样例2.png", FOVS[2] + "_产线样例3.png"];
        const dt = new DataTransfer();
        for (var di = 0; di < 3; di++) {
          (function (idx) {
            dataUrlToBlob(makeSampleDataUrl(idx), function (blob) {
              if (blob) dt.items.add(new File([blob], names[idx], { type: "image/png" }));
            });
          })(di);
        }
        rebuildLineQueueFromFiles(dt.files);
        updateImageSourceUI();
      });
    }

    document.querySelectorAll("[data-sample]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (getImageSourceMode() !== "manual") return;
        const i = parseInt(btn.getAttribute("data-sample"), 10) || 0;
        setImageFromUrl(makeSampleDataUrl(i), {});
      });
    });

    $("btn-close-poly").addEventListener("click", function () {
      tryClosePolygon(false);
    });

    $("btn-undo").addEventListener("click", function () {
      if (closed) closed = false;
      vertices.pop();
      markLineSessionDirty();
      redrawOverlay();
      updateStats();
    });

    $("btn-clear").addEventListener("click", function () {
      vertices = [];
      closed = false;
      markLineSessionDirty();
      redrawOverlay();
      updateStats();
    });

    $("calib-metric").addEventListener("change", function () {
      markLineSessionDirty();
      updateCalibPreview();
    });
    $("calib-mm").addEventListener("input", function () {
      markLineSessionDirty();
      updateCalibPreview();
    });
    $("calib-px").addEventListener("input", function () {
      markLineSessionDirty();
      updateCalibPreview();
    });
    $("btn-save-calib").addEventListener("click", function () {
      saveCalib({ andNext: false });
    });
    if ($("btn-save-calib-next")) {
      $("btn-save-calib-next").addEventListener("click", function () {
        saveCalib({ andNext: true });
      });
    }
    $("btn-cancel-edit").addEventListener("click", cancelEditRecord);

    document.querySelectorAll("[data-draw-tool]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setDrawTool(btn.getAttribute("data-draw-tool") || "poly");
      });
    });

    document.querySelectorAll("[data-clone-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        closeCloneDialog();
      });
    });
    if ($("btn-clone-confirm")) {
      $("btn-clone-confirm").addEventListener("click", function () {
        applyClone();
      });
    }

    if ($("pxmm-clone-edit-notice")) {
      $("pxmm-clone-edit-notice").addEventListener("click", function (e) {
        if (e.target && e.target.id === "btn-open-clone-source") {
          const sid = e.target.getAttribute("data-clone-source-id");
          if (sid) beginEditRecord(sid, { fromSourceButton: true });
        }
      });
    }

    $("manage-body").addEventListener("click", function (e) {
      const tr = e.target.closest("tr[data-rec-id]");
      if (!tr) return;
      const id = tr.getAttribute("data-rec-id");
      if (!id) return;
      if (e.target.classList.contains("btn-manage-edit")) {
        beginEditRecord(id);
      }
      if (e.target.classList.contains("btn-manage-clone")) {
        openCloneDialog(id);
      }
      if (e.target.classList.contains("btn-manage-del")) {
        if (!confirm(tr("pxmm_confirmDeleteRecord"))) return;
        idbDeleteBlob(id).then(
          function () {},
          function () {}
        ).then(function () {
          const list = loadRecords().filter(function (r) {
            return r.id !== id;
          });
          persistRecords(list);
          if (($("edit-record-id").value || "").trim() === id) {
            cancelEditRecord();
          }
          renderManageList();
        });
      }
    });

    imgEl = $("work-image");
    drawCanvas = $("draw-layer");
    drawCtx = drawCanvas.getContext("2d");

    drawCanvas.addEventListener("click", function (e) {
      if (closed) return;
      const p = clientToImageCoords(e.clientX, e.clientY);
      if (!p) return;
      if ((drawTool === "line" || drawTool === "rect" || drawTool === "circle") && vertices.length >= 2) {
        return;
      }
      vertices.push({ x: p.x, y: p.y });
      markLineSessionDirty();
      if (drawTool === "line" || drawTool === "rect" || drawTool === "circle") {
        if (vertices.length >= 2) {
          closed = true;
        }
      }
      redrawOverlay();
      updateStats();
    });

    drawCanvas.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      tryClosePolygon(true);
    });

    window.addEventListener("resize", function () {
      syncDrawCanvasSize();
    });

    if (typeof ResizeObserver !== "undefined" && imgEl) {
      new ResizeObserver(function () {
        syncDrawCanvasSize();
      }).observe(imgEl);
    }

    updateMetricSelectPreferred(null);
    updateDrawingToolButtons();
    updateImageSourceUI();
    showManageView();
    renderManageList();
    const eid0 = ($("edit-record-id") && ($("edit-record-id").value || "").trim());
    if ($("btn-save-calib")) {
      $("btn-save-calib").textContent = eid0 ? tr("pxmm_saveUpd") : tr("pxmm_save");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI);
  } else {
    bindUI();
  }
})();
