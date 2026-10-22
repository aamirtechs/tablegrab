# TableGrab

**One click copies any web table as Markdown, CSV or TSV. Free, open source, unlimited, no account.**

Every page on the web is full of tables you want somewhere else: a rate table into a spreadsheet, a pricing grid into a GitHub issue, a stats table into your notes. The tools that do this for you tend to charge for it in an annoying way. TableGrab does the whole job locally in your browser, with no caps, because copying a table should be free.

## Why TableGrab exists

The incumbents paywall the basics:

- **Table Capture**, the category leader, caps free exports at 250 rows, and puts CSV and Excel downloads and Markdown copying behind a subscription. (Source: Table Capture, Chrome Web Store listing and pricing page, read October 2026.)
- **TableClipper** caps free use at 100 rows. (Source: TableClipper, Chrome Web Store listing, read October 2026.)

TableGrab has no row limit, no format limit, and no account, and it never will: the conversion runs entirely on your machine, so there is no server bill to pass on to you.

## Features

- **Hover copy control.** Turn on copy buttons from the popup, hover any real `<table>` on the page, and a small gold "Copy table" button appears. Click it and choose Markdown, CSV or TSV.
- **Largest table shortcut.** The popup copies the biggest table on the active page (by row count) in one click, with a status line telling you how many rows were copied.
- **Clean, predictable output.** Headers are detected properly, cell whitespace is collapsed, rows are padded to a rectangle, and format escaping is done right (details below).
- **Nothing collected.** No analytics, no network calls, no account, no settings sync. Your tables never leave your clipboard.

## Privacy and permissions, in plain words

TableGrab asks for exactly three permissions, and each one earns its place:

- `activeTab`: lets the extension touch the tab you are looking at, only after you click the TableGrab icon. It grants no standing access to any site.
- `scripting`: lets Chrome run TableGrab's copy code inside that active tab when you click. This is how the popup copies the largest table and how the hover buttons get added.
- `clipboardWrite`: lets TableGrab put the converted table on your clipboard, which is the entire point of the tool.

There are **no host permissions** in the manifest (no `<all_urls>` access on install), and the manifest declares **no auto-running content scripts**. `extension/content.js`, the file that adds the hover buttons, is injected into the active tab only when you click "Show copy buttons on this page" in the popup. Close the tab and it is gone. If you only ever use the popup's largest-table buttons, the content script is never injected at all.

The demo page in this repo (`index.html`) runs the same conversion code with no extension involved.

## Install

### Chrome (load unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension` folder from this repo.
5. Pin TableGrab, visit any page with a table, and click the icon.

### Firefox

The extension is built on standard WebExtensions APIs (`activeTab`, `scripting`, `clipboardWrite`, MV3). For a temporary install, open `about:debugging`, choose "This Firefox", click "Load Temporary Add-on", and pick `extension/manifest.json`. Chrome is the tested target for v1.0.0; a signed Firefox listing is on the roadmap evaluation list, and minor manifest differences may apply there.

## How conversion works

TableGrab first reads a table into a plain model: an array of rows, each an array of cell strings, plus a header flag. The converters then format that model.

**Headers**

- If the table has a `<thead>`, its row is the header.
- Otherwise, if the first row contains `<th>` cells, that row is the header.
- Otherwise, the table has no header and every row is treated as data.

In Markdown, a header row is followed by the standard `---` separator row. **A table with no header is emitted as plain rows with no separator row and no invented column names**, in all three formats. What the page showed is what you get.

**Escaping and cleanup**

- Cell text has all internal whitespace (extra spaces, tabs, line breaks) collapsed to single spaces, so a messy cell cannot break the row structure.
- Markdown: pipe characters in cell text are escaped as `\|`, so a cell like `North | South` cannot split a column.
- CSV: a cell containing a comma, a double quote, or a newline is wrapped in double quotes, and inner double quotes are doubled, per RFC 4180. Rows are joined with CRLF.
- TSV: tabs and newlines inside a cell are flattened to single spaces, since a literal tab or newline would corrupt the columns and rows.
- Short rows are padded with empty cells so every row has the same number of columns.

## Try it without installing

Open `index.html` from this repo (it is also the GitHub Pages site). It contains two real sample tables, one with a header and one without, and buttons that run the exact conversion functions the extension uses, showing the result on the page before you paste it anywhere. The demo page duplicates the extension's conversion code in v1 so it can stand alone; parity between the two copies was verified with Node tests during development (see the build notes in the v1.0.0 release).

## Roadmap

- Virtualized and div-based tables (grids built from `<div>` elements, and tables that load rows as you scroll).
- Excel (.xlsx) export for people who want a file instead of the clipboard.
- Multi-page capture for paginated tables, stitching pages into one output.
- Optional keyboard shortcut for copying the largest table.

## License

MIT. See `LICENSE`. Copyright (c) 2026 Amir Hussain.

Built by Dispatch Authority, alongside SAFER USDOT Extractor, Load Board Fraud Lens, RateCon Shield and DetentionDesk.
