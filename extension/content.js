/*
 * TableGrab content script and shared table conversion logic.
 *
 * The conversion functions are pure: they accept a rows array
 * (an array of arrays of strings) and return formatted text.
 * parseTableModel turns a simple cell grid into that rows array,
 * so the converters can be tested without a DOM.
 *
 * This file is injected into the active tab only when the user
 * clicks the TableGrab popup button "Show copy buttons on this
 * page". It is never auto-injected (see manifest.json and the
 * README section on permissions).
 */
(function () {
  "use strict";

  /* ---------------- Pure conversion logic ---------------- */

  // Collapse all internal whitespace (spaces, tabs, newlines) in a
  // cell to single spaces and trim the ends.
  function normalizeCell(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  // Pad every row to the widest row length with empty strings so
  // the output is a clean rectangle.
  function padRows(rows) {
    var width = 0;
    rows.forEach(function (row) {
      if (row.length > width) width = row.length;
    });
    return rows.map(function (row) {
      var copy = row.slice();
      while (copy.length < width) copy.push("");
      return copy;
    });
  }

  function escapeMarkdownCell(text) {
    return normalizeCell(text).replace(/\|/g, "\\|");
  }

  // rows: array of arrays of strings. hasHeader: boolean.
  // With a header, row 0 is the header and a separator row follows.
  // Without a header, every row is data and no separator row is
  // emitted, so nothing the page showed is lost or invented.
  function rowsToMarkdown(rows, hasHeader) {
    if (!rows || rows.length === 0) return "";
    var padded = padRows(rows.map(function (row) {
      return row.map(escapeMarkdownCell);
    }));
    var lines = [];
    if (hasHeader) {
      lines.push("| " + padded[0].join(" | ") + " |");
      var separator = padded[0].map(function () { return "---"; });
      lines.push("| " + separator.join(" | ") + " |");
      for (var i = 1; i < padded.length; i++) {
        lines.push("| " + padded[i].join(" | ") + " |");
      }
    } else {
      padded.forEach(function (row) {
        lines.push("| " + row.join(" | ") + " |");
      });
    }
    return lines.join("\n");
  }

  function escapeCsvCell(text) {
    var value = String(text == null ? "" : text);
    if (/[",\r\n]/.test(value)) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  function rowsToCSV(rows) {
    if (!rows || rows.length === 0) return "";
    return padRows(rows).map(function (row) {
      return row.map(escapeCsvCell).join(",");
    }).join("\r\n");
  }

  function escapeTsvCell(text) {
    // Tabs and newlines would break the column and row structure,
    // so flatten them to single spaces.
    return String(text == null ? "" : text).replace(/[\t\r\n]+/g, " ");
  }

  function rowsToTSV(rows) {
    if (!rows || rows.length === 0) return "";
    return padRows(rows).map(function (row) {
      return row.map(escapeTsvCell).join("\t");
    }).join("\n");
  }

  function convertRows(rows, hasHeader, format) {
    if (format === "csv") return rowsToCSV(rows);
    if (format === "tsv") return rowsToTSV(rows);
    return rowsToMarkdown(rows, hasHeader);
  }

  /*
   * Turn a cell grid into the plain rows model.
   * grid: array of rows; each row is an array of cell objects
   *   { text: string, isHeader: boolean }
   * options: { fromThead: boolean } true when any row came from
   *   a thead element.
   * Returns { rows: string[][], hasHeader: boolean }.
   * Header detection: a thead row counts as a header. Otherwise
   * the first row counts as a header when at least one of its
   * cells is a th element.
   */
  function parseTableModel(grid, options) {
    var opts = options || {};
    var rows = (grid || []).map(function (row) {
      return row.map(function (cell) {
        return normalizeCell(cell && cell.text);
      });
    });
    var hasHeader = false;
    if (rows.length > 0) {
      if (opts.fromThead) {
        hasHeader = true;
      } else if (grid && grid.length > 0) {
        hasHeader = grid[0].some(function (cell) {
          return !!(cell && cell.isHeader);
        });
      }
    }
    return { rows: rows, hasHeader: hasHeader };
  }

  /* ---------------- DOM parsing (browser only) ---------------- */

  // Read a real <table> element into the plain rows model.
  function parseTable(tableEl) {
    var grid = [];
    var fromThead = false;
    var trList = tableEl.rows ? Array.prototype.slice.call(tableEl.rows) : [];
    trList.forEach(function (tr) {
      if (tr.parentNode && tr.parentNode.tagName === "THEAD") {
        fromThead = true;
      }
      var row = [];
      Array.prototype.slice.call(tr.cells).forEach(function (cell) {
        row.push({
          text: cell.textContent || "",
          isHeader: cell.tagName === "TH"
        });
      });
      if (row.length > 0) grid.push(row);
    });
    return parseTableModel(grid, { fromThead: fromThead });
  }

  function findTables(doc) {
    var tables = Array.prototype.slice.call(doc.querySelectorAll("table"));
    return tables.filter(function (table) {
      return table.rows && table.rows.length > 0;
    });
  }

  function largestTable(doc) {
    var tables = findTables(doc);
    var best = null;
    tables.forEach(function (table) {
      if (!best || table.rows.length > best.rows.length) best = table;
    });
    return best;
  }

  /* ---------------- Clipboard ---------------- */

  function writeClipboard(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (ok) resolve(); else reject(new Error("Copy command was rejected."));
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ---------------- Floating copy control (browser only) ---------------- */

  var STYLE_ID = "tablegrab-style";
  var activeTable = null;
  var hideTimer = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".tg-btn{position:absolute;z-index:2147483000;background:#c9a227;color:#0b1626;border:none;",
      "border-radius:6px;padding:6px 12px;font:600 12px 'Plus Jakarta Sans',system-ui,sans-serif;",
      "cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);display:none;}",
      ".tg-btn:hover{background:#e0bb3a;}",
      ".tg-chooser{position:absolute;z-index:2147483001;background:#101f38;border:1px solid #c9a227;",
      "border-radius:8px;padding:6px;display:none;box-shadow:0 10px 30px rgba(0,0,0,.45);}",
      ".tg-chooser button{display:block;width:100%;background:transparent;color:#f2ead2;border:none;",
      "text-align:left;padding:6px 10px;font:500 12px 'Plus Jakarta Sans',system-ui,sans-serif;cursor:pointer;border-radius:5px;}",
      ".tg-chooser button:hover{background:#1d3355;}",
      ".tg-toast{position:fixed;right:16px;bottom:16px;z-index:2147483002;background:#101f38;color:#f2ead2;",
      "border:1px solid #c9a227;border-radius:8px;padding:10px 14px;",
      "font:500 13px 'Plus Jakarta Sans',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);display:none;}"
    ].join("");
    document.documentElement.appendChild(style);
  }

  function showToast(message) {
    var toast = document.getElementById("tablegrab-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "tablegrab-toast";
      toast.className = "tg-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = "block";
    setTimeout(function () { toast.style.display = "none"; }, 2600);
  }

  function formatLabel(format) {
    if (format === "csv") return "CSV";
    if (format === "tsv") return "TSV";
    return "Markdown";
  }

  function copyTableElement(tableEl, format) {
    var model = parseTable(tableEl);
    var text = convertRows(model.rows, model.hasHeader, format);
    return writeClipboard(text).then(function () {
      showToast("Copied " + model.rows.length + " rows as " + formatLabel(format));
      return model.rows.length;
    });
  }

  function positionNear(el, tableEl) {
    var rect = tableEl.getBoundingClientRect();
    el.style.top = (window.scrollY + rect.top - 6) + "px";
    el.style.left = (window.scrollX + rect.right - el.offsetWidth - 8) + "px";
  }

  function initCopyButtons() {
    injectStyles();

    var button = document.getElementById("tablegrab-copy-btn");
    if (!button) {
      button = document.createElement("button");
      button.id = "tablegrab-copy-btn";
      button.className = "tg-btn";
      button.textContent = "Copy table";
      document.body.appendChild(button);
    }

    var chooser = document.getElementById("tablegrab-chooser");
    if (!chooser) {
      chooser = document.createElement("div");
      chooser.id = "tablegrab-chooser";
      chooser.className = "tg-chooser";
      ["markdown", "csv", "tsv"].forEach(function (format) {
        var option = document.createElement("button");
        option.textContent = "Copy as " + formatLabel(format);
        option.setAttribute("data-format", format);
        option.addEventListener("click", function () {
          chooser.style.display = "none";
          button.style.display = "none";
          if (activeTable) copyTableElement(activeTable, format);
        });
        chooser.appendChild(option);
      });
      document.body.appendChild(chooser);
    }

    function scheduleHide() {
      hideTimer = setTimeout(function () {
        button.style.display = "none";
        chooser.style.display = "none";
      }, 350);
    }
    function cancelHide() {
      if (hideTimer) clearTimeout(hideTimer);
    }

    button.addEventListener("mouseenter", cancelHide);
    button.addEventListener("mouseleave", scheduleHide);
    chooser.addEventListener("mouseenter", cancelHide);
    chooser.addEventListener("mouseleave", scheduleHide);
    button.addEventListener("click", function () {
      cancelHide();
      positionNear(chooser, activeTable);
      chooser.style.top = (parseFloat(button.style.top || "0") + 34) + "px";
      chooser.style.display = "block";
    });

    findTables(document).forEach(function (table) {
      if (table.getAttribute("data-tablegrab-bound") === "1") return;
      table.setAttribute("data-tablegrab-bound", "1");
      table.addEventListener("mouseenter", function () {
        cancelHide();
        activeTable = table;
        button.style.display = "block";
        positionNear(button, table);
      });
      table.addEventListener("mouseleave", scheduleHide);
    });
  }

  /* ---------------- Exports and browser init ---------------- */

  var api = {
    normalizeCell: normalizeCell,
    padRows: padRows,
    rowsToMarkdown: rowsToMarkdown,
    rowsToCSV: rowsToCSV,
    rowsToTSV: rowsToTSV,
    convertRows: convertRows,
    parseTableModel: parseTableModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.TableGrab = api;
    if (window.__tablegrabLoaded) {
      initCopyButtons();
    } else {
      window.__tablegrabLoaded = true;
      initCopyButtons();
    }
  }
})();
