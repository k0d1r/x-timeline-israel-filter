(function () {
  "use strict";

  // Engellemek istediğin ifadeleri aşağıdaki üç listeden uygun olana ekle (tırnak + virgül).
  // Değişiklikten sonra: chrome://extensions → eklentiyi yenile → X sekmesini yenile.
  //
  // substrings: Metin içinde geçmesi yeterli; emoji veya tam parça. Büyük/küçük harf aynen eşleşir.
  //   Örnek ekleme: substrings: ["🇮🇱", "📌"],
  //
  // wholeWords: Sadece tam kelime olarak; cümle içinde bitişik harf olmadan. Harfler birebir.
  //   Örnek ekleme: wholeWords: ["Israel", "israel", "Kelime"],
  //
  // phrases: Birden fazla kelimelik ifade; kelimeler arasında boşluk sayısı esnek. Harfler birebir.
  //   Örnek ekleme: phrases: ["Flag of Israel", "Başka bir ifade"],
  const BLOCK_TERMS = {
    substrings: ["🇮🇱"],
    wholeWords: ["Israel", "israel"],
    phrases: ["Flag of Israel"],
  };

  const HIDDEN_CLASS = "ui-state-collapsed";
  const VIEW_STATE_ATTR = "data-view-state";
  const VIEW_STATE_HIDDEN = "hidden";

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compileMatchers() {
    const fns = [];
    for (const sub of BLOCK_TERMS.substrings) {
      if (sub) fns.push((t) => t.includes(sub));
    }
    for (const w of BLOCK_TERMS.wholeWords) {
      if (w) {
        const re = new RegExp("\\b" + escapeRe(w) + "\\b");
        fns.push((t) => re.test(t));
      }
    }
    for (const p of BLOCK_TERMS.phrases) {
      const parts = (p || "").trim().split(/\s+/).filter(Boolean);
      if (parts.length) {
        const re = new RegExp(parts.map(escapeRe).join("\\s+"));
        fns.push((t) => re.test(t));
      }
    }
    return fns;
  }

  const MATCH_KEYWORD = compileMatchers();

  // autoBlock: true  → Engelle menüsü / onay (programatik tıklama; tarayıcı isTrusted / X DOM kırılabilir).
  // autoBlock: false → yalnızca tweet gizleme; caret tıklanmaz, profil sayfasında otomatik engel yok.
  const CONFIG = {
    debounceMs: 180,
    blockCooldownMs: 2200,
    uiWaitMs: 4500,
    menuPollMs: 80,
    autoBlock: true,
  };

  const processedArticles = new WeakSet();
  const recentBlockAttempts = new Map();
  const recentArticleBlockAttempts = new WeakMap();
  let blockChain = Promise.resolve();
  let debounceTimer = null;
  let styleInjected = false;

  function injectHideStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const el = document.createElement("style");
    el.textContent = `.${HIDDEN_CLASS}{display:none!important;opacity:0!important;pointer-events:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;}`;
    (document.head || document.documentElement).appendChild(el);
  }

  function normalizeText(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }

  function getSelfUsername() {
    const profile =
      document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
      document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] a[href^="/"]');
    if (!profile) return null;
    const href = profile.getAttribute("href") || "";
    const m = href.match(/^\/([A-Za-z0-9_]{1,30})(?:\/)?$/);
    return m ? m[1].toLowerCase() : null;
  }

  function extractUsernameFromTweetArticle(article) {
    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    if (!userNameRoot) return null;
    const links = userNameRoot.querySelectorAll('a[href^="/"]');
    const skip = new Set([
      "home",
      "explore",
      "notifications",
      "messages",
      "i",
      "settings",
      "compose",
      "search",
      "hashtag",
    ]);
    for (const a of links) {
      const href = (a.getAttribute("href") || "").split("?")[0];
      const m = href.match(/^\/([A-Za-z0-9_]{1,30})$/);
      if (m) {
        const h = m[1];
        if (!skip.has(h.toLowerCase())) return h;
      }
    }
    return null;
  }

  function collectTweetScanText(article) {
    const parts = [];
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    if (userNameEl) parts.push(userNameEl.textContent || "");
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    if (tweetTextEl) parts.push(tweetTextEl.textContent || "");
    return normalizeText(parts.join(" "));
  }

  function collectProfileScanText(root = document) {
    const parts = [];
    const desc =
      root.querySelector('[data-testid="UserDescription"]') ||
      root.querySelector('[data-testid="UserBio"]');
    if (desc) parts.push(desc.textContent || "");
    const nameBlock =
      root.querySelector('[data-testid="UserName"]') ||
      root.querySelector('[data-testid="User-Names"]');
    if (nameBlock) parts.push(nameBlock.textContent || "");
    return normalizeText(parts.join(" "));
  }

  function matchesKeywords(combinedText) {
    if (!combinedText) return false;
    for (const fn of MATCH_KEYWORD) {
      if (fn(combinedText)) return true;
    }
    return false;
  }

  function hideTweet(article) {
    injectHideStyle();
    article.classList.add(HIDDEN_CLASS);
    article.setAttribute(VIEW_STATE_ATTR, VIEW_STATE_HIDDEN);
    try {
      article.style.setProperty("display", "none", "important");
    } catch (_) {}
  }

  function findVisibleMenu() {
    const menus = document.querySelectorAll('div[role="menu"]');
    for (const m of menus) {
      if (m.offsetParent !== null || m.getClientRects().length > 0) return m;
    }
    return document.querySelector('div[role="menu"]');
  }

  const BLOCK_UI_LATIN_WORD_RES = [
    /\bblock\b/,
    /\bengelle\b/,
    /\bblockieren\b/,
    /\bbloquear\b/,
    /\bbloquer\b/,
    /\bblocca\b/,
    /\bblokkeren\b/,
    /\bzablokuj\b/,
    /\bblokovat\b/,
    /\bblokir\b/,
    /\bblockera\b/,
    /\bblokeer\b/,
    /\bblokkere\b/,
    /\bblochează\b/,
    /\bblocare\b/,
    /\bbloquejar\b/,
    /\bbloqueie\b/,
    /\bbloķēt\b/,
    /\bblokeeri\b/,
  ];

  const BLOCK_UI_INTL_RES = [
    /заблокировать|блокировать|заблокувати|заблакіраваць/i,
    /حظر|حجب/,
    /ブロック/,
    /차단/,
    /封鎖|屏蔽/,
    /ब्लॉक/,
  ];

  const BLOCK_UI_AT_LINE_SUBSTRINGS = [
    "block",
    "engelle",
    "blockieren",
    "bloquear",
    "bloquer",
    "blocca",
    "blokkeren",
    "zablokuj",
    "blokovat",
    "blokir",
    "blockera",
    "blokeer",
    "blokkere",
    "blochează",
    "blocare",
    "bloquejar",
    "bloqueie",
    "bloķēt",
    "blokeeri",
    "блок",
    "заблок",
    "حظر",
    "ブロック",
    "차단",
    "封鎖",
    "屏蔽",
    "ब्लॉक",
  ];

  function collectElementLabels(el) {
    if (!el) return "";
    const parts = [
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.textContent,
    ];
    return parts.filter(Boolean).join("\n");
  }

  function textIndicatesBlockAction(elOrString) {
    const text =
      typeof elOrString === "string" ? elOrString : collectElementLabels(elOrString);
    if (!text || !String(text).trim()) return false;
    const t = normalizeText(text).toLowerCase();
    for (const re of BLOCK_UI_LATIN_WORD_RES) {
      if (re.test(t)) return true;
    }
    for (const re of BLOCK_UI_INTL_RES) {
      if (re.test(text) || re.test(t)) return true;
    }
    if (t.includes("@") || String(text).includes("@")) {
      const hay = (t + "\n" + String(text).toLowerCase()).toLowerCase();
      for (const s of BLOCK_UI_AT_LINE_SUBSTRINGS) {
        if (hay.includes(s.toLowerCase())) return true;
      }
    }
    return false;
  }

  function menuItemLooksLikeBlock(el) {
    return textIndicatesBlockAction(el);
  }

  function clickBlockMenuItem(menu) {
    const items = menu.querySelectorAll('[role="menuitem"], div[role="menuitem"]');
    for (const item of items) {
      if (menuItemLooksLikeBlock(item)) {
        item.click();
        return true;
      }
    }
    return false;
  }

  function tryClickBlockConfirmationOnce() {
    const confirmBtn =
      document.querySelector('[data-testid="confirmationSheetConfirm"]') ||
      document.querySelector('div[role="dialog"] [data-testid="confirmationSheetConfirm"]');
    if (confirmBtn) {
      const r = confirmBtn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        confirmBtn.click();
        return true;
      }
    }
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return false;
    const buttons = dialog.querySelectorAll('button[role="button"], div[role="button"]');
    for (const b of buttons) {
      if (textIndicatesBlockAction(b)) {
        b.click();
        return true;
      }
    }
    return false;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitFor(fn, timeoutMs, stepMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(stepMs);
    }
    return null;
  }

  function getCaretForTweet(article) {
    const carets = article.querySelectorAll('[data-testid="caret"]');
    if (carets.length === 1) return carets[0];
    for (const c of carets) {
      const row = c.closest('[data-testid="tweetHeader"]') || c.closest("div");
      if (row && article.contains(row)) return c;
    }
    return carets[0] || null;
  }

  async function tryBlockUserFromTweetArticle(article, username) {
    const caret = getCaretForTweet(article);
    if (!caret) return false;

    caret.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
    caret.click();

    const menu = await waitFor(findVisibleMenu, CONFIG.uiWaitMs, CONFIG.menuPollMs);
    if (!menu || !clickBlockMenuItem(menu)) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }

    await sleep(220);
    const deadline = Date.now() + CONFIG.uiWaitMs;
    let confirmed = false;
    while (Date.now() < deadline) {
      if (tryClickBlockConfirmationOnce()) {
        confirmed = true;
        break;
      }
      await sleep(CONFIG.menuPollMs);
    }
    if (!confirmed) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    return confirmed;
  }

  function shouldThrottleBlock(username) {
    if (!username) return false;
    const now = Date.now();
    const last = recentBlockAttempts.get(username.toLowerCase()) || 0;
    if (now - last < CONFIG.blockCooldownMs) return true;
    recentBlockAttempts.set(username.toLowerCase(), now);
    return false;
  }

  function shouldThrottleBlockArticle(article, username) {
    if (username) return shouldThrottleBlock(username);
    const now = Date.now();
    const last = recentArticleBlockAttempts.get(article) || 0;
    if (now - last < CONFIG.blockCooldownMs) return true;
    recentArticleBlockAttempts.set(article, now);
    return false;
  }

  function queueBlockTask(article, username) {
    blockChain = blockChain.then(async () => {
      if (!document.contains(article)) return;
      if (shouldThrottleBlockArticle(article, username)) {
        hideTweet(article);
        return;
      }
      let ok = false;
      try {
        ok = await tryBlockUserFromTweetArticle(article, username);
      } catch (_) {
        ok = false;
      }
      if (!ok && document.contains(article)) {
        hideTweet(article);
      }
    });
  }

  function scanTweetArticle(article) {
    if (!(article instanceof HTMLElement)) return;
    if (processedArticles.has(article)) return;
    if (article.getAttribute(VIEW_STATE_ATTR) === VIEW_STATE_HIDDEN) {
      processedArticles.add(article);
      return;
    }

    const selfUser = getSelfUsername();
    const handle = extractUsernameFromTweetArticle(article);
    if (handle && selfUser && handle.toLowerCase() === selfUser) {
      processedArticles.add(article);
      return;
    }

    const text = collectTweetScanText(article);
    if (!matchesKeywords(text)) {
      processedArticles.add(article);
      return;
    }

    processedArticles.add(article);
    hideTweet(article);
    if (CONFIG.autoBlock) {
      queueBlockTask(article, handle);
    }
  }

  let lastProfileBlockPath = "";

  function profileHandleFromPath() {
    const seg = location.pathname.replace(/^\//, "").split("/").filter(Boolean);
    if (seg.length !== 1) return null;
    const h = seg[0];
    const reserved = new Set([
      "home",
      "explore",
      "notifications",
      "messages",
      "settings",
      "compose",
      "search",
      "i",
      "intent",
      "login",
    ]);
    if (reserved.has(h.toLowerCase())) return null;
    return h;
  }

  function scanProfileSurfaces(root) {
    const handle = profileHandleFromPath();
    if (!handle) return;

    const selfUser = getSelfUsername();
    if (selfUser && handle.toLowerCase() === selfUser) return;

    const text = collectProfileScanText(root);
    if (!matchesKeywords(text)) return;

    if (!CONFIG.autoBlock) return;

    if (lastProfileBlockPath === location.pathname) return;
    lastProfileBlockPath = location.pathname;

    let menuBtn =
      root.querySelector('[data-testid="userActions"] [data-testid="caret"]') ||
      root.querySelector('[data-testid="profileHeader"] [data-testid="caret"]') ||
      root.querySelector('[data-testid="UserActions"] [data-testid="caret"]');

    if (!menuBtn) {
      const ua = root.querySelector('[data-testid="userActions"]');
      if (ua) menuBtn = ua.querySelector('[data-testid="caret"]');
    }

    if (!menuBtn || shouldThrottleBlock(handle)) return;

    blockChain = blockChain.then(() => tryOpenProfileBlock(menuBtn));
  }

  async function tryOpenProfileBlock(caret) {
    caret.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
    caret.click();
    const menu = await waitFor(findVisibleMenu, CONFIG.uiWaitMs, CONFIG.menuPollMs);
    if (menu) clickBlockMenuItem(menu);
    await sleep(220);
    const deadline = Date.now() + CONFIG.uiWaitMs;
    while (Date.now() < deadline) {
      if (tryClickBlockConfirmationOnce()) break;
      await sleep(CONFIG.menuPollMs);
    }
  }

  function scanAll() {
    injectHideStyle();

    if (!profileHandleFromPath()) {
      lastProfileBlockPath = "";
    }

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(scanTweetArticle);

    const profileRoot =
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('main[role="main"]');
    if (profileRoot && profileHandleFromPath()) {
      scanProfileSurfaces(profileRoot);
    }
  }

  function scheduleScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      requestAnimationFrame(scanAll);
    }, CONFIG.debounceMs);
  }

  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: false,
    attributes: false,
  });

  scheduleScan();
})();
