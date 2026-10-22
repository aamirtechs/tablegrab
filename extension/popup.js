/*
 * TableGrab popup wiring.
 * No inline handlers: every button is wired with addEventListener.
 */
(function () {
  "use strict";

  var statusEl = document.getElementById("status");

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function formatLabel(format) {
    if (format === "csv") return "CSV";
    if (format === "tsv") return "TSV";
    return "Markdown";
  }

  /*
   * Self-contained function injected into the active tab by
   * chrome.scripting. It cannot reference anything outside itself,
   * so the conversion logic is duplicated here in miniature. The
   * canonical version lives in content.js and on the demo page.
   * Returns { rows: number, format: string } or null when the page
   * has no table.
   */
  function copyLargestTableInPage(format) {
    function clean(text) {
      return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    }
    function pad(rows) {
      var width = 0;
      rows.forEach(function (row) { if (row.length > width) width = row.length; });
      return rows.map(function (row) {
        var copy = row.slice();
        while (copy.length < width) copy.push("");
        return copy;
      });
    }
    function toMarkdown(rows, hasHeader) {
      var padded = pad(rows.map(function (row) {
        return row.map(function (cell) { return clean(cell).replace(/\|/g, "\\|"); });
      }));
      var lines = [];
      if (hasHeader) {
        lines.push("| " + padded[0].join(" | ") + " |");
        lines.push("| " + padded[0].map(function () { return "---"; }).join(" | ") + " |");
        for (var i = 1; i < padded.length; i++) lines.push("| " + padded[i].join(" | ") + " |");
      } else {
        padded.forEach(function (row) { lines.push("| " + row.join(" | ") + " |"); });
      }
      return lines.join("\n");
    }
    function toCSV(rows) {
      return pad(rows).map(function (row) {
        return row.map(function (cell) {
          var value = String(cell == null ? "" : cell);
          if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
          return value;
        }).join(",");
      }).join("\r\n");
    }
    function toTSV(rows) {
      return pad(rows).map(function (row) {
        return row.map(function (cell) {
          return String(cell == null ? "" : cell).replace(/[\t\r\n]+/g, " ");
        }).join("\t");
      }).join("\n");
    }

    var tables = Array.prototype.slice.call(document.querySelectorAll("table")).filter(function (t) {
      return t.rows && t.rows.length > 0;
    });
    if (tables.length === 0) return null;

    var best = tables[0];
    tables.forEach(function (t) { if (t.rows.length > best.rows.length) best = t; });

    var grid = [];
    var fromThead = false;
    Array.prototype.slice.call(best.rows).forEach(function (tr) {
      if (tr.parentNode && tr.parentNode.tagName === "THEAD") fromThead = true;
      var row = [];
      Array.prototype.slice.call(tr.cells).forEach(function (cell) {
        row.push({ text: cell.textContent || "", isHeader: cell.tagName === "TH" });
      });
      if (row.length > 0) grid.push(row);
    });

    var rows = grid.map(function (row) {
      return row.map(function (cell) { return clean(cell.text); });
    });
    var hasHeader = fromThead || (grid.length > 0 && grid[0].some(function (cell) { return cell.isHeader; }));

    var text;
    if (format === "csv") text = toCSV(rows);
    else if (format === "tsv") text = toTSV(rows);
    else text = toMarkdown(rows, hasHeader);

    return navigator.clipboard.writeText(text).then(function () {
      return { rows: rows.length, format: format };
    });
  }

  function runCopy(format) {
    setStatus("Working...");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        setStatus("No active tab found.");
        return;
      }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, func: copyLargestTableInPage, args: [format] },
        function (results) {
          if (chrome.runtime.lastError) {
            setStatus("This page will not allow it. Try a normal web page.");
            return;
          }
          var outcome = results && results[0] && results[0].result;
          if (!outcome) {
            setStatus("No table found on this page.");
            return;
          }
          setStatus("Copied " + outcome.rows + " rows as " + formatLabel(outcome.format));
        }
      );
    });
  }

  function enableButtonsOnPage() {
    setStatus("Working...");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        setStatus("No active tab found.");
        return;
      }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        function () {
          if (chrome.runtime.lastError) {
            setStatus("This page will not allow it. Try a normal web page.");
            return;
          }
          setStatus("Copy buttons are on. Hover any table on the page.");
        }
      );
    });
  }

  document.querySelectorAll("button[data-format]").forEach(function (button) {
    button.addEventListener("click", function () {
      runCopy(button.getAttribute("data-format"));
    });
  });
  document.getElementById("enable-buttons").addEventListener("click", enableButtonsOnPage);
})();
