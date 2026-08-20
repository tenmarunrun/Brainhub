(function () {
  "use strict";

  var STORAGE_KEY = "brainhub-v1";

  var DEFAULT_DATA = {
    activeWorkspaceId: "work",
    workspaces: [
      { id: "work", name: "仕事", icon: "💼" },
      { id: "school", name: "学校", icon: "🎓" },
      { id: "travel", name: "旅行", icon: "✈️" },
      { id: "idea", name: "アイデア", icon: "💡" }
    ],
    memos: {
      work: [],
      school: [],
      travel: [],
      idea: []
    }
  };

  var STOPWORDS = ["こと", "これ", "それ", "ため", "よう", "そう", "です", "ます", "した", "する", "ない", "の", "は", "が", "を", "に", "で", "と", "も"];

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();
  var searchResultIds = null;
  var lastAnswer = null;

  function el(id) { return document.getElementById(id); }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  }

  function activeWorkspace() {
    for (var i = 0; i < state.workspaces.length; i++) {
      if (state.workspaces[i].id === state.activeWorkspaceId) return state.workspaces[i];
    }
    return state.workspaces[0] || null;
  }

  function currentMemos() {
    var ws = activeWorkspace();
    if (!ws) return [];
    return state.memos[ws.id] || [];
  }

  function extractTags(text, max) {
    var cleaned = text.replace(/[。、,.!?「」『』()（）\n\r]/g, " ");
    var tokens = cleaned.split(/[\s　]+/).map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length >= 2 && STOPWORDS.indexOf(t) === -1; });
    var seen = {};
    var order = [];
    tokens.forEach(function (t) {
      if (!(t in seen)) { seen[t] = 0; order.push(t); }
      seen[t]++;
    });
    order.sort(function (a, b) { return seen[b] - seen[a]; });
    return order.slice(0, max || 3);
  }

  function renderSidebar() {
    var list = el("wsList");
    list.innerHTML = "";
    state.workspaces.forEach(function (ws) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.className = "ws-btn" + (ws.id === state.activeWorkspaceId ? " active" : "");
      btn.type = "button";
      var count = (state.memos[ws.id] || []).length;
      btn.innerHTML = "<span>" + ws.icon + "</span><span>" + escapeHtml(ws.name) + "</span><span class=\"count\">" + count + "</span>";
      btn.addEventListener("click", function () {
        state.activeWorkspaceId = ws.id;
        searchResultIds = null;
        lastAnswer = null;
        save();
        renderAll();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderHeader() {
    var ws = activeWorkspace();
    el("pageSubtitle").textContent = ws ? ws.name + " のメモ" : "あなた専用の第二の脳";
    el("modalWsName").textContent = ws ? ws.name : "";
    el("fabBtn").disabled = !ws;
  }

  function renderList() {
    var memos = currentMemos();
    var shown = searchResultIds ? memos.filter(function (m) { return searchResultIds.indexOf(m.id) !== -1; }) : memos;
    el("listTitle").textContent = searchResultIds ? "検索結果 (" + shown.length + ")" : "記憶の記録 (" + memos.length + ")";

    var area = el("listArea");
    area.innerHTML = "";

    if (shown.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = searchResultIds
        ? "<p>一致するメモが見つかりませんでした。</p>"
        : "<p>まだメモがありません。<br />右下の「＋」から最初の記憶を書いてみましょう。</p>";
      area.appendChild(empty);
      return;
    }

    var ul = document.createElement("ul");
    ul.className = "memo-list";
    shown.forEach(function (memo) {
      var li = document.createElement("li");
      li.className = "memo-card";

      var tagsHtml = (memo.tags || []).map(function (t) {
        return '<span class="tag">' + escapeHtml(t) + "</span>";
      }).join("");

      li.innerHTML =
        '<div class="memo-top">' +
          '<h3 class="memo-title">' + escapeHtml(memo.title || "無題のメモ") + "</h3>" +
          '<div class="memo-meta">' +
            '<span class="memo-date">' + formatDate(memo.date) + "</span>" +
            '<button class="memo-del" data-id="' + memo.id + '" aria-label="削除">✕</button>' +
          "</div>" +
        "</div>" +
        (memo.content ? '<p class="memo-body">' + escapeHtml(memo.content) + "</p>" : "") +
        (tagsHtml ? '<div class="tag-row">' + tagsHtml + "</div>" : "");

      ul.appendChild(li);
    });
    area.appendChild(ul);

    Array.prototype.forEach.call(area.querySelectorAll(".memo-del"), function (btn) {
      btn.addEventListener("click", function () {
        deleteMemo(btn.getAttribute("data-id"));
      });
    });
  }

  function renderAnswer() {
    var box = el("answerBox");
    var hint = el("searchHint");
    if (lastAnswer) {
      box.style.display = "flex";
      el("answerText").textContent = lastAnswer;
      hint.textContent = "";
    } else {
      box.style.display = "none";
      hint.textContent = currentMemos().length === 0 ? "メモを1件保存すると、AIに質問できるようになります。" : "";
    }
  }

  function renderAll() {
    renderSidebar();
    renderHeader();
    renderList();
    renderAnswer();
  }

  function deleteMemo(id) {
    var ws = activeWorkspace();
    if (!ws) return;
    state.memos[ws.id] = (state.memos[ws.id] || []).filter(function (m) { return m.id !== id; });
    if (searchResultIds) searchResultIds = searchResultIds.filter(function (i) { return i !== id; });
    save();
    renderAll();
  }

  // MVP: client-side keyword matching. Planned upgrade: send the query and
  // the workspace's memos to an AI backend (see README) for natural-language
  // answers grounded only in the saved memos.
  function runSearch(query) {
    var memos = currentMemos();
    if (memos.length === 0) {
      lastAnswer = "まだメモがありません。メモを保存すると、AIに質問できるようになります。";
      searchResultIds = [];
      renderAll();
      return;
    }
    var terms = query.toLowerCase().split(/[\s　,、]+/).filter(Boolean);
    var matched = memos.filter(function (m) {
      var hay = (m.title + " " + m.content + " " + (m.tags || []).join(" ")).toLowerCase();
      return terms.some(function (t) { return hay.indexOf(t) !== -1; });
    });
    searchResultIds = matched.map(function (m) { return m.id; });
    lastAnswer = matched.length > 0
      ? "キーワード検索で " + matched.length + " 件のメモが見つかりました。"
      : "一致するメモが見つかりませんでした。";
    renderAll();
  }

  el("searchBtn").addEventListener("click", function () {
    var q = el("searchInput").value.trim();
    if (!q) return;
    runSearch(q);
  });
  el("searchInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") el("searchBtn").click();
  });
  el("answerClose").addEventListener("click", function () {
    lastAnswer = null;
    searchResultIds = null;
    el("searchInput").value = "";
    renderAll();
  });

  el("wsAddBtn").addEventListener("click", function () {
    el("wsAddForm").style.display = "block";
    el("wsAddBtn").style.display = "none";
    el("wsAddInput").focus();
  });
  function commitNewWorkspace() {
    var name = el("wsAddInput").value.trim();
    el("wsAddForm").style.display = "none";
    el("wsAddBtn").style.display = "flex";
    el("wsAddInput").value = "";
    if (!name) return;
    var id = "ws-" + Date.now();
    state.workspaces.push({ id: id, name: name, icon: "🗂️" });
    state.memos[id] = [];
    state.activeWorkspaceId = id;
    save();
    renderAll();
  }
  el("wsAddInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") commitNewWorkspace();
    if (e.key === "Escape") { el("wsAddForm").style.display = "none"; el("wsAddBtn").style.display = "flex"; }
  });
  el("wsAddInput").addEventListener("blur", function () {
    setTimeout(commitNewWorkspace, 120);
  });

  function openModal() {
    el("memoTitle").value = "";
    el("memoContent").value = "";
    el("modalOverlay").classList.remove("hidden");
    el("memoContent").focus();
  }
  function closeModal() { el("modalOverlay").classList.add("hidden"); }

  el("fabBtn").addEventListener("click", openModal);
  el("modalClose").addEventListener("click", closeModal);
  el("modalCancel").addEventListener("click", closeModal);
  el("modalOverlay").addEventListener("click", function (e) {
    if (e.target === el("modalOverlay")) closeModal();
  });

  el("modalSave").addEventListener("click", function () {
    var title = el("memoTitle").value.trim();
    var rawContent = el("memoContent").value.trim();
    if (!rawContent) { el("memoContent").focus(); return; }
    var content = rawContent;
    if (!title) {
      var lines = rawContent.split("\n");
      title = lines[0].trim();
      content = lines.slice(1).join("\n").trim();
    }
    var ws = activeWorkspace();
    if (!ws) return;
    var memo = {
      id: "m-" + Date.now(),
      title: title || "無題のメモ",
      content: content,
      tags: extractTags(title + " " + content, 4),
      date: new Date().toISOString()
    };
    state.memos[ws.id] = state.memos[ws.id] || [];
    state.memos[ws.id].unshift(memo);
    searchResultIds = null;
    lastAnswer = null;
    save();
    renderAll();
    closeModal();
  });

  el("resetBtn").addEventListener("click", function () {
    state = JSON.parse(JSON.stringify(DEFAULT_DATA));
    searchResultIds = null;
    lastAnswer = null;
    save();
    renderAll();
  });

  renderAll();
})();
