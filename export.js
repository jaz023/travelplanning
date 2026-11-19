
/*
 * Travel Planner V2.1
 * 行程匯出功能
 *
 * PDF：瀏覽器列印 / 儲存為 PDF
 * HTML：下載包含行程與樣式的離線檔案
 *
 * 不修改 Google Sheets 資料。
 */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  // 確認目前有行程可以匯出
  function hasItinerary() {
    const select = $("project-select");
    const itinerary = $("itinerary");

    if (
      !select ||
      !select.value ||
      !itinerary?.querySelector(".view-day")
    ) {
      alert(
        "目前沒有可匯出的行程，請先選擇旅遊專案。"
      );
      return false;
    }

    return true;
  }

  // 避免文字被解析為 HTML
  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }

  // 建立安全的檔案名稱
  function getFileName() {
    const title =
      $("view-title")?.textContent.trim() ||
      "旅遊行程";

    const safeName = title
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
      .slice(0, 60);

    return (safeName || "旅遊行程") +
      "_離線行程";
  }

  // 製作完全獨立的離線 HTML
  function buildOfflineHtml() {
    const title =
      $("view-title")?.textContent.trim() ||
      "旅遊行程";

    const subtitle =
      $("view-subtitle")?.textContent.trim() ||
      "";

    const budget =
      $("budget-summary")?.cloneNode(true);

    const itinerary =
      $("itinerary")?.cloneNode(true);

    const content = document.createElement("div");

    if (budget) content.append(budget);
    if (itinerary) content.append(itinerary);

    // 移除不需要的互動元件
    content.querySelectorAll(
      "script, iframe, form, button, input, select, textarea"
    ).forEach(node => node.remove());

    // 僅保留 http / https 參考連結
    content.querySelectorAll("a").forEach(link => {
      const href = link.getAttribute("href") || "";

      if (!/^https?:\/\//i.test(href)) {
        link.removeAttribute("href");
      } else {
        link.setAttribute(
          "rel",
          "noopener noreferrer"
        );
        link.setAttribute("target", "_blank");
      }
    });

    // 離線檔案直接內嵌 CSS
    const css = `
      * {
        box-sizing: border-box;
      }

      body {
        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Noto Sans TC",
          "Microsoft JhengHei",
          sans-serif;

        margin: 0;
        background: #f5f8fb;
        color: #243243;
        line-height: 1.65;
      }

      main {
        max-width: 920px;
        margin: auto;
        padding: 30px 20px 60px;
      }

      header {
        background: linear-gradient(
          110deg,
          #e2f1fb,
          #edf8f0
        );

        padding: 26px;
        border-radius: 16px;
        margin-bottom: 20px;
      }

      h1 {
        font-size: 30px;
        margin: 0 0 8px;
      }

      h2 {
        font-size: 20px;
      }

      h3 {
        font-size: 17px;
      }

      .subtitle,
      .muted {
        color: #6c7d8d;
      }

      .panel {
        background: white;
        border: 1px solid #e2eaf1;
        border-radius: 14px;
        padding: 20px;
      }

      .section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
      }

      .budget-total {
        padding: 13px;
        background: #eaf7f0;
        border-radius: 10px;
        color: #23765a;
        font-weight: bold;
      }

      .view-day {
        border-bottom: 1px solid #e5ebf2;
        padding: 12px 0 22px;
        margin-bottom: 15px;
      }

      .timeline {
        border-left: 3px solid #cce6f8;
        margin-left: 10px;
        padding-left: 22px;
      }

      .timeline-card {
        position: relative;
        padding-bottom: 20px;
        break-inside: avoid;
      }

      .timeline-card::before {
        content: "";
        position: absolute;
        left: -30px;
        top: 7px;
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: #3290c9;
        border: 3px solid white;
      }

      .timeline-card h3 {
        margin: 4px 0;
      }

      .timeline-card p {
        margin: 6px 0;
        white-space: pre-wrap;
      }

      .time {
        font-weight: bold;
        color: #2075ad;
      }

      a {
        color: #235fad;
        overflow-wrap: anywhere;
      }

      .tip {
        font-size: 12px;
        color: #718296;
        margin-top: 20px;
      }

      @page {
        size: A4;
        margin: 12mm;
      }

      @media print {
        body {
          background: white;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        main {
          max-width: none;
          padding: 0;
        }

        .panel {
          border: 0;
          padding: 0;
        }

        .view-day {
          break-inside: avoid-page;
        }

        .tip {
          display: none;
        }
      }
    `;

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>${escapeHtml(title)}｜離線行程</title>
  <style>${css}</style>
</head>

<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">
        ${escapeHtml(subtitle)}
      </div>
    </header>

    <section class="panel">
      ${content.innerHTML}
    </section>

    <p class="tip">
      此檔案為下載當下的行程快照，
      不會與 Google Sheets 同步。
      Google Maps 和外部參考連結需要網路。
    </p>
  </main>
</body>
</html>`;
  }

  // 下載離線 HTML
  function downloadOfflineHtml() {
    if (!hasItinerary()) return;

    const html = buildOfflineHtml();

    const blob = new Blob(
      [html],
      {
        type: "text/html;charset=utf-8"
      }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = getFileName() + ".html";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  // 使用瀏覽器輸出 PDF
  function exportPdf() {
    if (!hasItinerary()) return;

    window.print();
  }

  // 綁定按鈕
  $("export-html")?.addEventListener(
    "click",
    downloadOfflineHtml
  );

  $("export-pdf")?.addEventListener(
    "click",
    exportPdf
  );

})();
