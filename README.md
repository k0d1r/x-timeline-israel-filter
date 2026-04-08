# X Keyword Filter

A Manifest V3 extension compatible with Chrome and Brave. It scans tweet and profile texts on [X.com](https://x.com) / [twitter.com](https://twitter.com); hides content matching your defined terms from the timeline first, then attempts the **Block** flow via the DOM if possible.

## Default targets related to Israel

This project is designed to hide or block content containing **text/emojis directly implying or showing Israel** in the X feed, based on user-defined rules. The list can be expanded or modified via **`BLOCK_TERMS`** in `content.js`.

**Current default matches:**

| Type | Example |
|-----|--------|
| Emoji | Flag of Israel (`🇮🇱`) — `substrings` |
| Word | `Israel` and `israel` (case-sensitive) — `wholeWords` |
| Phrase | `Flag of Israel` — `phrases` |

You can use other expressions related to Israel (e.g., specific English/Turkish phrases, other emojis) by adding them to the appropriate list under **`BLOCK_TERMS`**. Be careful with the risk of false positives; `wholeWords` and `phrases` are generally not as aggressive as `substrings`.

## Installation — Google Chrome

1. Ensure that the `manifest.json` and `content.js` files are together in this folder.
2. Type **`chrome://extensions`** into the address bar and press Enter.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** → select the `merhaba` folder (or whatever you named your folder).
5. **X Keyword Filter** should appear in the list; if there is a red error, check the `manifest.json` path.

## Installation — Brave

Brave is also Chromium-based; the steps are the same, only the extension page address is different.

1. Type **`brave://extensions`** into the address bar and press Enter.
2. Enable **Developer mode**.
3. Select this project folder (the folder containing `manifest.json`) using **Load unpacked**.
4. If you see an issue on X (if the content script isn't running at all), you can try temporarily lowering **Brave Shields** just for `x.com`; this is usually not required for most setups.

## Daily use (Chrome and Brave)

- No need to press an additional button: it runs automatically on the X or Twitter tab.
- On pages where tweets are listed like **home, lists, search**, matching posts are hidden; if possible, the block menu is also attempted.
- If the bio/name matches on a **profile page**, the blocking flow can be triggered via the profile.
- After modifying the word list via **`BLOCK_TERMS`** in `content.js`:
  1. Open the `chrome://extensions` or `brave://extensions` page,
  2. Click the **refresh (↻)** icon on this extension's card,
  3. **Refresh** any open X tabs (F5 or Cmd+R / Ctrl+R).

## Development / Updating

Whenever `content.js` or `manifest.json` changes: **refresh** the extension on the extensions page, then refresh the X tab.

## Operating mode: hide-only vs. auto-block

**`CONFIG.autoBlock`** is used within `content.js`:

| Value | Behavior |
|--------|-----------|
| **`true`** (default) | After the matching tweet is hidden, the **Block** flow is attempted (`caret`, menu, confirmation). If a bio/name matches on a profile, a block is attempted from the profile menu. |
| **`false`** | **Hide only**: tweets are silently hidden in the timeline; no menu opens, no programmatic clicking, no automatic blocking from profiles. |

To just hide, simply setting `autoBlock: false` is enough; you don't need to delete the `queueBlockTask` line.

## Adding words / phrases

Edit the **`BLOCK_TERMS`** object at the top of the `content.js` file:

| Field | When to use |
|------|----------------------|
| `substrings` | It is enough if it appears anywhere in the text (emoji, short snippet). Case matches **exactly**. |
| `wholeWords` | **Whole words** only (word boundary). Characters match exactly (`Israel` and `israel` can be on different lines). |
| `phrases` | Multi-word phrases; the number of spaces between words is flexible. Characters match exactly. |

There are also short examples in the comments within the file.

## How it works (summary)

- **Scanning:** `User-Name` and `tweetText` in tweets; description and name fields in profiles (via `data-testid`).
- **DOM:** Scanning combined with `MutationObserver` + a short delay; processed tweets are not scanned again using `WeakSet`.
- **Hiding:** Upon a match, the tweet is hidden immediately (`ui-state-collapsed`, `data-view-state="hidden"`, and inline style). These names can be changed in one place via the `HIDDEN_CLASS` / `VIEW_STATE_ATTR` constants in `content.js`. Even if the block menu breaks, the post remains hidden in the feed.
- **Blocking:** `caret` → "block" action in the menu (checks for `block` / `bloquear` / `blockieren` etc. in many languages and extra roots in lines containing `@`; `aria-label` / `title` are also read) → confirmation dialog; similar flow on the profile page. Still, if X texts change, new language patterns can be added to the `BLOCK_UI_*` lists in `content.js`.

## File structure

```text
merhaba/
├── manifest.json   # MV3 definition, host permissions (x.com, twitter.com)
├── content.js      # All logic and BLOCK_TERMS
└── README.md
```

There is no `background.js`; operations are handled in the content script.

## Warnings and technical limitations

### X's DOM (interface) changes

X uses a dynamic, React-based interface; structures like `data-testid` (e.g., `confirmationSheetConfirm`), `role="menu"`, and similar can change **even in a minor update**. In this case, the automatic **Block** step might stop working; the **hiding** side generally remains more resilient as long as the `article` element exists in the DOM.

### Programmatic clicking and `isTrusted`

With `.click()` or synthesized `MouseEvent`s in the browser, `event.isTrusted` is generally **false**. If X or the browser introduces additional checks in the future that only allow "real" user interactions, the menu might not open at all. If you **do not** want this risk, use only the hide mode via `CONFIG.autoBlock: false`.

### Other

- Automated interaction may be considered against X's terms of service or create patterns that lead the account to be flagged for automation; use at your own risk.
- This repository is for local installation only; it has not been published to the Chrome Web Store.

## License

Not specified; you can modify the project as you wish for personal use.
