
/*
 * Travel Planner V2.0
 * 共用 JavaScript
 *
 * 功能：
 * 1. 本機 localStorage
 * 2. Google Sheets API
 * 3. 多旅遊專案
 * 4. 許願池
 * 5. 行程編輯
 * 6. 拖曳排序
 * 7. 費用統計
 * 8. Google Maps 路線
 */

(() => {
  "use strict";

  // ===== 基礎設定 =====

  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page;
  const cfg = window.TRAVEL_CONFIG || {};
  const localMode = cfg.mode !== "google";
  const STORE = "travel-planner-v2";

  let data = {
    projects: [],
    wishes: [],
    items: []
  };

  let selected = "";
  let draft = null;
  let dirty = false;
  let seq = 0;

  const esc = s => String(s ?? "");

  const el = (tag, cls = "", txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = esc(txt);
    return n;
  };

  const clear = n => n.replaceChildren();

  const setMsg = (s, type = "") => {
    const target = $("message");
    if (!target) return;
    clear(target);
    if (s) target.append(el("div", "notice " + type, s));
  };

  const unique = prefix =>
    prefix + "_" + Date.now() + "_" +
    Math.random().toString(36).slice(2, 10);

  const project = () =>
    data.projects.find(p => p.id === selected);

  const wishes = () =>
    data.wishes.filter(w => w.projectId === selected);

  const currency = () =>
    draft?.currency || project()?.currency || "TWD";

  const formatCost = n =>
    new Intl.NumberFormat("zh-TW", {
      maximumFractionDigits: 2
    }).format(Number(n) || 0) + " " + currency();

  const allowedUrl = s => {
    try {
      const u = new URL(s);
      return ["https:", "http:"].includes(u.protocol)
        ? u.href
        : "";
    } catch {
      return "";
    }
  };

  const extLink = (url, title) => {
    const a = el("a", "link", title);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  };

  const dateOf = (s, d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) {
      return "Day " + d;
    }

    const [y, m, day] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day + d - 1));

    return dt.toISOString().slice(0, 10);
  };

  // ===== 資料格式 =====

  const normalizeItem = i => ({
    id: esc(i.id || unique("i")),
    projectId: esc(i.projectId || selected),
    day: Math.max(1, Number(i.day) || 1),
    time: esc(i.time || ""),
    name: esc(i.name || ""),
    location: esc(i.location || ""),
    transport: esc(i.transport || ""),
    note: esc(i.note || ""),
    url: esc(i.url || ""),
    wishId: esc(i.wishId || ""),
    cost: Math.max(0, Number(i.cost) || 0),
    sort: Number(i.sort) || 0
  });

  const cleanData = raw => ({
    projects: (raw.projects || []).map(p => ({
      ...p,
      dayCount: Math.max(1, Number(p.dayCount) || 1),
      revision: Number(p.revision) || 0
    })),
    wishes: raw.wishes || [],
    items: (raw.items || []).map(normalizeItem)
  });

  // ===== 本機示範資料 =====

  const demo = () => ({
    projects: [
      {
        id: "demo-tokyo",
        title: "東京四天三夜示範旅行",
        startDate: "2026-12-10",
        currency: "JPY",
        dayCount: 4,
        revision: 0
      }
    ],

    wishes: [
      {
        id: "w1",
        projectId: "demo-tokyo",
        name: "淺草寺",
        type: "景點",
        priority: "必去",
        person: "旅伴 A",
        note: "想逛雷門",
        url: "",
        createdAt: "示範資料"
      },
      {
        id: "w2",
        projectId: "demo-tokyo",
        name: "新幹線體驗",
        type: "交通",
        priority: "想去",
        person: "旅伴 B",
        note: "安排不要太遠的路線",
        url: "",
        createdAt: "示範資料"
      }
    ],

    items: [
      {
        id: "i1",
        projectId: "demo-tokyo",
        day: 1,
        time: "10:00",
        name: "淺草寺",
        location: "淺草寺 東京都",
        transport: "地鐵",
        note: "雷門拍照",
        url: "",
        wishId: "w1",
        cost: 0,
        sort: 1
      },
      {
        id: "i2",
        projectId: "demo-tokyo",
        day: 1,
        time: "12:00",
        name: "午餐",
        location: "淺草 東京都",
        transport: "步行",
        note: "",
        url: "",
        wishId: "",
        cost: 1500,
        sort: 2
      }
    ]
  });

  function readLocal() {
    let value;

    try {
      value = JSON.parse(localStorage.getItem(STORE) || "null");
    } catch {
      value = null;
    }

    if (!value) {
      value = demo();
      localStorage.setItem(STORE, JSON.stringify(value));
    }

    return cleanData(value);
  }

  // ===== 統一 API =====

  function api(action, payload = {}) {

    // 本機模式
    if (localMode) {
      return Promise.resolve().then(() => {
        const db = readLocal();
        let result = {};

        if (action === "getData") {
          return db;
        }

        if (action === "addWish") {
          const name = esc(payload.name).trim();

          if (!name) {
            throw Error("請填寫願望名稱");
          }

          if (!db.projects.some(
            p => p.id === payload.projectId
          )) {
            throw Error("找不到專案");
          }

          const wish = {
            ...payload,
            id: unique("w"),
            createdAt: new Date().toLocaleString("zh-TW")
          };

          db.wishes.push(wish);
          result = { id: wish.id };
        }

        else if (action === "createProject") {
          const title = esc(payload.title).trim();

          if (!title) {
            throw Error("請填寫專案名稱");
          }

          const p = {
            id: unique("p"),
            title,
            startDate: "",
            currency: "TWD",
            dayCount: 1,
            revision: 0
          };

          db.projects.push(p);
          result = p;
        }

        else if (action === "saveItinerary") {
          const p = db.projects.find(
            p => p.id === payload.project.id
          );

          if (!p) {
            throw Error("專案不存在");
          }

          if (
            Number(payload.revision) !==
            Number(p.revision)
          ) {
            throw Error(
              "行程已由其他視窗更新，請重新整理"
            );
          }

          Object.assign(
            p,
            payload.project,
            { revision: p.revision + 1 }
          );

          db.items = db.items
            .filter(i => i.projectId !== p.id)
            .concat(payload.items.map(normalizeItem));

          result = { revision: p.revision };
        }

        else {
          throw Error("不支援的操作");
        }

        localStorage.setItem(
          STORE,
          JSON.stringify(db)
        );

        return result;
      });
    }

    // ===== Google Sheets 模式 =====

    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/
        .test(cfg.gasUrl || "")
    ) {
      return Promise.reject(
        Error("請在 config.js 設定 Google Apps Script /exec 網址")
      );
    }

    // GET：JSONP 讀取
    if (action === "getData") {
      return new Promise((resolve, reject) => {
        const cb = "__travelJsonp_" + (++seq);
        const script = el("script");
        let timer;

        const done = () => {
          clearTimeout(timer);
          delete window[cb];
          script.remove();
        };

        timer = setTimeout(() => {
          done();
          reject(Error("讀取逾時"));
        }, 20000);

        window[cb] = response => {
          done();

          response?.ok
            ? resolve(response.result)
            : reject(
                Error(response?.error || "讀取失敗")
              );
        };

        script.onerror = () => {
          done();
          reject(
            Error("讀取失敗，請檢查 Apps Script 部署權限")
          );
        };

        script.src =
          cfg.gasUrl +
          (cfg.gasUrl.includes("?") ? "&" : "?") +
          "action=getData&callback=" +
          encodeURIComponent(cb) +
          "&t=" + Date.now();

        document.head.append(script);
      });
    }

    // POST：隱藏表單 + iframe
    return new Promise((resolve, reject) => {
      const nonce = unique("post");
      const frame = el("iframe");
      frame.name = unique("frame");
      frame.hidden = true;

      const form = el("form");
      form.method = "POST";
      form.action = cfg.gasUrl;
      form.target = frame.name;
      form.hidden = true;

      const fields = {
        action,
        nonce,
        payload: JSON.stringify(payload)
      };

      for (const [k, v] of Object.entries(fields)) {
        const input = el("input");
        input.type = "hidden";
        input.name = k;
        input.value = v;
        form.append(input);
      }

      document.body.append(frame, form);

      const done = () => {
        clearTimeout(timer);
        window.removeEventListener("message", listener);
        form.remove();
        frame.remove();
      };

      const listener = e => {
        if (
          !/^https:\/\/(?:[a-z0-9-]+\.)?googleusercontent\.com$/
            .test(e.origin) &&
          e.origin !== "https://script.google.com"
        ) {
          return;
        }

        if (
          e.data?.channel !== "TRAVEL_PLANNER_V2" ||
          e.data?.nonce !== nonce
        ) {
          return;
        }

        done();

        e.data.ok
          ? resolve(e.data.result)
          : reject(
              Error(e.data.error || "寫入失敗")
            );
      };

      const timer = setTimeout(() => {
        done();
        reject(
          Error(
            "寫入逾時，請重新整理確認資料，勿立刻重複送出"
          )
        );
      }, 30000);

      window.addEventListener("message", listener);
      form.submit();
    });
  }

  // ===== 編輯狀態 =====

  const saveDirty = () => {
    dirty = true;

    if ($("unsaved")) {
      $("unsaved").textContent =
        "● 有尚未儲存的變更";
    }
  };

  const itemList = () => draft?.items || [];

  function projectOptions() {
    const select = $("project-select");
    if (!select) return;

    clear(select);

    if (!data.projects.length) {
      const opt = el("option", "", "尚無專案");
      opt.value = "";
      select.append(opt);
      selected = "";
      return;
    }

    if (!data.projects.some(p => p.id === selected)) {
      selected = data.projects[0].id;
    }

    data.projects.forEach(p => {
      const o = el("option", "", p.title);
      o.value = p.id;
      select.append(o);
    });

    select.value = selected;
  }

  function choose(id) {
    selected = id;

    const url = new URL(location.href);
    url.searchParams.set("trip", id);
    history.replaceState(null, "", url);

    openDraft();
    render();
  }

  function openDraft() {
    const p = project();

    draft = p
      ? {
          ...p,
          items: data.items
            .filter(i => i.projectId === p.id)
            .map(normalizeItem)
        }
      : null;

    dirty = false;

    if ($("unsaved")) {
      $("unsaved").textContent = "";
    }
  }

  function render() {
    projectOptions();

    const indicator = $("mode-indicator");

    if (indicator) {
      indicator.textContent = localMode
        ? "🧪 本機測試 · 資料僅存在這個瀏覽器"
        : "☁ Google Sheets 模式";
    }

    if (page === "wish") renderWishes(false);
    if (page === "editor") renderEditor();
    if (page === "view") renderView();
  }

  // ===== 許願卡片 =====

  function wishCard(w, editable) {
    const box = el("article", "item");
    const head = el("div", "item-head");

    head.append(el("h3", "", w.name));

    const planned = itemList().some(
      i => i.wishId === w.id
    );

    head.append(
      el(
        "span",
        "pill " + (planned ? "done" : ""),
        planned ? "已安排" : w.priority
      )
    );

    box.append(head);

    box.append(
      el(
        "p",
        "meta",
        [
          w.type,
          w.person || "匿名",
          w.createdAt || ""
        ].filter(Boolean).join(" · ")
      )
    );

    if (w.note) {
      box.append(el("p", "", w.note));
    }

    if (allowedUrl(w.url)) {
      box.append(
        extLink(allowedUrl(w.url), "參考連結 ↗")
      );
    }

    if (editable) {
      const btn = el(
        "button",
        "btn small primary",
        "＋ 加入行程"
      );

      btn.type = "button";

      btn.onclick = () => {
        draft.items.push(
          normalizeItem({
            id: unique("i"),
            projectId: selected,
            day: draft.dayCount,
            name: w.name,
            location: w.name,
            note: w.note,
            url: w.url,
            wishId: w.id
          })
        );

        saveDirty();
        renderEditor();

        setMsg("已加入最後一天，記得儲存");
      };

      box.append(btn);
    }

    return box;
  }

  function renderWishes(editable) {
    const root = $("wishes");
    if (!root) return;

    clear(root);

    if (!selected) {
      root.append(
        el(
          "div",
          "empty",
          "尚無旅遊專案，請至編輯頁建立"
        )
      );
      return;
    }

    const ws = wishes().slice().reverse();

    if (!ws.length) {
      root.append(
        el("div", "empty", "目前沒有願望")
      );
    }

    ws.forEach(w =>
      root.append(wishCard(w, editable))
    );
  }

  // ===== 編輯欄位 =====

  const field = (
    label,
    value,
    update,
    opts = {}
  ) => {
    const box = el("div", "field");
    const lab = el("label", "", label);

    const control = el(
      opts.multiline ? "textarea" : "input"
    );

    if (!opts.multiline) {
      control.type = opts.type || "text";
    }

    control.value = value ?? "";

    if (opts.max) {
      control.maxLength = opts.max;
    }

    if (opts.type === "number") {
      control.min = 0;
      control.step = "0.01";
    }

    control.oninput = () => {
      update(control.value);
      saveDirty();
    };

    box.append(lab, control);
    return box;
  };

  // ===== 活動排序 =====

  function moveItem(id, dir) {
    const items = draft.items;
    const item = items.find(i => i.id === id);
    if (!item) return;

    const matches = items.filter(
      i => i.day === item.day
    );

    const idx = matches.findIndex(
      i => i.id === id
    );

    const other = matches[idx + dir];
    if (!other) return;

    const a = items.indexOf(item);
    const b = items.indexOf(other);

    [items[a], items[b]] = [
      items[b],
      items[a]
    ];

    saveDirty();
    renderDays();
  }

  // ===== Google Maps 路線 =====

  function buildRoute(entries) {
    const places = entries
      .map(i => i.location.trim())
      .filter(Boolean);

    if (places.length < 2) return "";

    const stops = places.slice(0, 9);

    let u =
      "https://www.google.com/maps/dir/?api=1" +
      "&origin=" +
      encodeURIComponent(stops[0]) +
      "&destination=" +
      encodeURIComponent(stops.at(-1)) +
      "&travelmode=driving";

    if (stops.length > 2) {
      u +=
        "&waypoints=" +
        encodeURIComponent(
          stops.slice(1, -1).join("|")
        );
    }

    return u;
  }

  // ===== 預算統計 =====

  function renderBudget(rootId) {
    const root = $(rootId);
    if (!root || !draft) return;

    clear(root);

    const total = itemList().reduce(
      (s, i) => s + i.cost,
      0
    );

    root.append(
      el(
        "p",
        "budget-total",
        "預估總費用：" +
          formatCost(total) +
          "（不含未填寫的費用）"
      )
    );
  }

  // ===== 行程編輯頁 =====

  function renderEditor() {
    if (!draft) {
      clear($("days"));
      clear($("wishes"));
      return;
    }

    $("trip-title").value = draft.title;
    $("trip-start").value = draft.startDate || "";
    $("trip-currency").value =
      draft.currency || "TWD";

    $("view-link").href =
      "view.html?trip=" +
      encodeURIComponent(selected);

    renderWishes(true);
    renderBudget("budget-summary");
    renderDays();
  }

  function renderDays() {
    const root = $("days");
    clear(root);

    if (!draft) return;

    for (let day = 1; day <= draft.dayCount; day++) {

      const block = el("section", "day");
      const head = el("div", "day-header");
      const tools = el("div", "actions");

      head.append(
        el(
          "h3",
          "",
          `Day ${day} · ${dateOf(draft.startDate, day)}`
        )
      );

      // 新增活動
      const add = el(
        "button",
        "btn small primary",
        "＋ 新增活動"
      );

      add.type = "button";

      add.onclick = () => {
        draft.items.push(
          normalizeItem({
            id: unique("i"),
            projectId: selected,
            day,
            name: "新活動"
          })
        );

        saveDirty();
        renderDays();
      };

      tools.append(add);

      // 刪除最後一天
      if (
        day === draft.dayCount &&
        day > 1
      ) {
        const del = el(
          "button",
          "btn small danger",
          "刪除末日"
        );

        del.type = "button";

        del.onclick = () => {
          if (
            draft.items.some(i => i.day === day) &&
            !confirm(
              "這一天的活動會一同刪除，確定嗎？"
            )
          ) {
            return;
          }

          draft.items = draft.items.filter(
            i => i.day !== day
          );

          draft.dayCount--;
          saveDirty();
          renderEditor();
        };

        tools.append(del);
      }

      head.append(tools);
      block.append(head);

      const body = el("div", "day-body");

      const entries = draft.items.filter(
        i => i.day === day
      );

      if (!entries.length) {
        body.append(
          el(
            "div",
            "empty",
            "這一天尚未安排活動"
          )
        );
      }

      entries.forEach((it, index) => {

        const box = el(
          "article",
          "editor-item"
        );

        box.draggable = true;
        box.dataset.id = it.id;

        // 拖曳開始
        box.addEventListener(
          "dragstart",
          e => {
            e.dataTransfer.setData(
              "text/plain",
              it.id
            );

            e.dataTransfer.effectAllowed =
              "move";

            box.classList.add("dragging");
          }
        );

        box.addEventListener(
          "dragend",
          () => box.classList.remove("dragging")
        );

        box.addEventListener(
          "dragover",
          e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        );

        // 拖曳放置
        box.addEventListener(
          "drop",
          e => {
            e.preventDefault();

            const id = e.dataTransfer.getData(
              "text/plain"
            );

            const from = draft.items.find(
              i => i.id === id
            );

            if (!from || id === it.id) return;

            const fromIdx =
              draft.items.indexOf(from);

            draft.items.splice(fromIdx, 1);

            from.day = day;

            draft.items.splice(
              draft.items.indexOf(it),
              0,
              from
            );

            saveDirty();
            renderDays();
          }
        );

        box.append(
          el(
            "div",
            "drag-handle",
            "☰ 拖曳此活動排序"
          )
        );

        const grid = el("div", "editor-grid");

        const edit = key => v => {
          it[key] = key === "cost"
            ? Math.max(0, Number(v) || 0)
            : v;

          if (key === "cost") {
            renderBudget("budget-summary");
          }
        };

        // 行程欄位
        grid.append(
          field(
            "時間",
            it.time,
            edit("time"),
            { type: "time" }
          ),
          field(
            "景點／活動名稱",
            it.name,
            edit("name"),
            { max: 100 }
          ),
          field(
            "地點（Google Maps 搜尋）",
            it.location,
            edit("location"),
            { max: 200 }
          ),
          field(
            "交通方式",
            it.transport,
            edit("transport"),
            { max: 100 }
          ),
          field(
            "預估費用（" + currency() + "）",
            it.cost,
            edit("cost"),
            { type: "number" }
          ),
          field(
            "參考網址",
            it.url,
            edit("url"),
            {
              type: "url",
              max: 500
            }
          ),
          field(
            "備註",
            it.note,
            edit("note"),
            {
              multiline: true,
              max: 1200
            }
          )
        );

        box.append(grid);

        // 編輯工具
        const actions = el("div", "actions");

        const up = el(
          "button",
          "btn small",
          "↑ 上移"
        );

        const down = el(
          "button",
          "btn small",
          "↓ 下移"
        );

        up.type = "button";
        down.type = "button";

        up.disabled = index === 0;

        down.disabled =
          index === entries.length - 1;

        up.onclick = () =>
          moveItem(it.id, -1);

        down.onclick = () =>
          moveItem(it.id, 1);

        actions.append(up, down);

        // 跨日移動
        const change = el(
          "select",
          "btn small"
        );

        change.title = "移至第幾天";

        for (
          let n = 1;
          n <= draft.dayCount;
          n++
        ) {
          const o = el(
            "option",
            "",
            `移至 Day ${n}`
          );

          o.value = n;
          o.selected = n === day;
          change.append(o);
        }

        change.onchange = () => {
          it.day = Number(change.value);
          saveDirty();
          renderDays();
        };

        actions.append(change);

        // 刪除活動
        const remove = el(
          "button",
          "btn small danger",
          "刪除"
        );

        remove.type = "button";

        remove.onclick = () => {
          draft.items = draft.items.filter(
            i => i.id !== it.id
          );

          saveDirty();
          renderEditor();
        };

        actions.append(remove);
        box.append(actions);
        body.append(box);
      });

      block.append(body);
      root.append(block);
    }
  }

  // ===== 行程展示頁 =====

  function renderView() {
    const title = $("view-title");
    const subtitle = $("view-subtitle");
    const root = $("itinerary");

    clear(root);

    if (!draft) {
      title.textContent = "尚未建立旅行";
      subtitle.textContent =
        "請到行程編輯頁建立專案";
      return;
    }

    title.textContent = draft.title;

    subtitle.textContent =
      (draft.startDate
        ? "出發日期：" + draft.startDate + " · "
        : "") +
      "共 " +
      draft.dayCount +
      " 天 · 費用幣別 " +
      currency();

    $("wish-link").href =
      "wish.html?trip=" +
      encodeURIComponent(selected);

    renderBudget("budget-summary");

    for (
      let day = 1;
      day <= draft.dayCount;
      day++
    ) {
      const section = el(
        "section",
        "view-day"
      );

      const head = el(
        "div",
        "section-title"
      );

      const entries = itemList().filter(
        i => i.day === day
      );

      const cost = entries.reduce(
        (s, i) => s + i.cost,
        0
      );

      head.append(
        el(
          "h2",
          "",
          `Day ${day} · ${dateOf(draft.startDate, day)}`
        )
      );

      const route = buildRoute(entries);

      if (route) {
        head.append(
          extLink(
            route,
            "🧭 Google Maps 全日路線（最多前 9 個地點）"
          )
        );
      }

      section.append(
        head,
        el(
          "p",
          "muted small",
          "當日預估費用：" +
            formatCost(cost)
        )
      );

      const timeline = el(
        "div",
        "timeline"
      );

      if (!entries.length) {
        timeline.append(
          el(
            "p",
            "muted",
            "尚未安排活動"
          )
        );
      }

      entries.forEach(i => {
        const card = el(
          "article",
          "timeline-card"
        );

        if (i.time) {
          card.append(
            el("div", "time", i.time)
          );
        }

        card.append(
          el("h3", "", i.name)
        );

        if (i.location) {
          card.append(
            el(
              "p",
              "muted",
              "📍 " + i.location
            )
          );
        }

        if (i.transport) {
          card.append(
            el(
              "p",
              "muted",
              "🚆 " + i.transport
            )
          );
        }

        if (i.cost) {
          card.append(
            el(
              "p",
              "muted",
              "💰 " + formatCost(i.cost)
            )
          );
        }

        if (i.note) {
          card.append(
            el("p", "", i.note)
          );
        }

        const links = el(
          "div",
          "actions"
        );

        if (i.location) {
          links.append(
            extLink(
              "https://www.google.com/maps/search/?api=1&query=" +
                encodeURIComponent(i.location),
              "Google Maps ↗"
            )
          );
        }

        if (allowedUrl(i.url)) {
          links.append(
            extLink(
              allowedUrl(i.url),
              "參考資訊 ↗"
            )
          );
        }

        card.append(links);
        timeline.append(card);
      });

      section.append(timeline);
      root.append(section);
    }
  }

  // ===== 重新讀取 =====

  async function refresh(force = false) {
    if (
      !force &&
      page === "editor" &&
      dirty &&
      !confirm(
        "目前尚未儲存，確定捨棄變更並重新讀取？"
      )
    ) {
      return;
    }

    setMsg("正在讀取資料…");

    try {
      data = cleanData(
        await api("getData")
      );

      if (
        !data.projects.some(
          p => p.id === selected
        )
      ) {
        selected =
          data.projects[0]?.id || "";
      }

      openDraft();
      render();
      setMsg("");

    } catch (e) {
      setMsg(e.message, "error");
    }
  }

  // ===== 啟動 =====

  function init() {
    const query = new URLSearchParams(
      location.search
    ).get("trip");

    if (query) {
      selected = query;
    }

    $("refresh")?.addEventListener(
      "click",
      () => refresh()
    );

    $("project-select")?.addEventListener(
      "change",
      e => {
        if (
          dirty &&
          !confirm(
            "尚未儲存的變更會遺失，確定切換？"
          )
        ) {
          e.target.value = selected;
          return;
        }

        choose(e.target.value);
      }
    );

    // ===== 許願池功能 =====

    if (page === "wish") {
      $("wish-form").onsubmit = async e => {
        e.preventDefault();

        if (!selected) {
          setMsg(
            "請先建立專案",
            "error"
          );
          return;
        }

        const btn = $("wish-submit");
        btn.disabled = true;

        setMsg("送出願望中…");

        try {
          await api("addWish", {
            projectId: selected,
            name: $("wish-name").value.trim(),
            type: $("wish-type").value,
            priority: $("wish-priority").value,
            person: $("wish-person").value.trim(),
            note: $("wish-note").value.trim(),
            url: $("wish-url").value.trim()
          });

          $("wish-form").reset();

          await refresh();

          setMsg(
            "願望已成功送出",
            "ok"
          );

        } catch (err) {
          setMsg(
            err.message,
            "error"
          );

        } finally {
          btn.disabled = false;
        }
      };
    }

    // ===== 編輯頁功能 =====

    if (page === "editor") {

      $("trip-title").oninput = e => {
        if (draft) {
          draft.title = e.target.value;
          saveDirty();
        }
      };

      $("trip-start").onchange = e => {
        if (draft) {
          draft.startDate = e.target.value;
          saveDirty();
          renderDays();
        }
      };

      $("trip-currency").onchange = e => {
        if (draft) {
          draft.currency = e.target.value;
          saveDirty();
          renderEditor();
        }
      };

      $("add-day").onclick = () => {
        if (
          draft &&
          draft.dayCount < 60
        ) {
          draft.dayCount++;
          saveDirty();
          renderDays();
        }
      };

      // 建立新專案
      $("create-project").onclick = async () => {
        const name =
          $("new-project-name").value.trim();

        if (!name) {
          setMsg(
            "請填入新專案名稱",
            "error"
          );
          return;
        }

        const pin =
          $("editor-pin").value.trim();

        if (!localMode && !pin) {
          setMsg(
            "請輸入編輯 PIN",
            "error"
          );
          return;
        }

        try {
          const p = await api(
            "createProject",
            {
              title: name,
              pin
            }
          );

          await refresh(true);
          choose(p.id);

          $("new-project-name").value = "";

          setMsg(
            "已建立新專案",
            "ok"
          );

        } catch (e) {
          setMsg(
            e.message,
            "error"
          );
        }
      };

      // 儲存行程
      $("save").onclick = async () => {
        if (!draft) return;

        const pin =
          $("editor-pin").value.trim();

        if (!localMode && !pin) {
          setMsg(
            "請輸入編輯 PIN",
            "error"
          );
          return;
        }

        if (
          !draft.title.trim() ||
          draft.items.some(
            i =>
              !i.name.trim() ||
              !Number.isFinite(i.cost) ||
              i.cost < 0
          )
        ) {
          setMsg(
            "請檢查活動名稱及費用",
            "error"
          );
          return;
        }

        const btn = $("save");
        btn.disabled = true;

        setMsg("正在儲存…");

        try {
          const items = draft.items.map(
            (i, index) => ({
              ...i,
              sort: index + 1
            })
          );

          await api("saveItinerary", {
            pin,
            revision: draft.revision,
            project: {
              id: draft.id,
              title: draft.title,
              startDate: draft.startDate,
              currency: draft.currency,
              dayCount: draft.dayCount
            },
            items
          });

          // 成功後重新讀取，不顯示未儲存警告
          await refresh(true);

          setMsg(
            "行程已成功儲存",
            "ok"
          );

        } catch (e) {
          setMsg(
            e.message,
            "error"
          );

        } finally {
          btn.disabled = false;
        }
      };

      // 防止意外離開未儲存頁面
      window.addEventListener(
        "beforeunload",
        e => {
          if (dirty) {
            e.preventDefault();
            e.returnValue = "";
          }
        }
      );
    }

    refresh();
  }

  init();

})();
