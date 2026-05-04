# API Mock Master

A Chrome extension to intercept and mock HTTP responses for development and testing — without touching your backend or network proxy.

![Chrome](https://img.shields.io/badge/Chrome-111+-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)

---

## Changelog

### v1.1.0
- **Drag & drop** — reorder mocks and groups by dragging their handles; drop a mock onto a group header to move it into that group
- **Import / Export** — export all mocks, a single mock, or an entire group to JSON; import with merge or replace-all modes and optional group assignment
- **Inline rename** — double-click a mock name to rename it; default display name is derived from the endpoint path
- **Deep-expand JSON** — Format JSON button now recursively un-stringifies nested JSON-encoded strings
- **Improved group UI** — groups have a distinct blue left border, header background, and mock count badge
- **Dropdown overflow fix** — ⋮ dropdowns now render above overflow:hidden containers using `position: fixed`
- **Removed Label field** — mock display name is now managed via inline rename instead of a separate form field
- **Larger popup** — increased minimum height to 480 px

### v1.0.0
- Initial release

---

## Features

- **Intercept fetch & XHR** — overrides both `window.fetch` and `XMLHttpRequest` directly in the page's main world, so every request is caught regardless of the library used (axios, ky, jQuery, etc.)
- **Custom response** — set any status code, response body (JSON / text), response headers, and simulated delay (ms)
- **URL matching** — exact URL, wildcard `*`, or base URL ignoring query params
- **Groups** — organise mocks into collapsible folders (double-click to rename)
- **Auto-save** — all changes persist automatically with a 700 ms debounce; no Save button needed
- **Toggle on/off** — enable or disable individual mocks or turn off all mocking globally
- **Active icon** — extension icon turns orange when mocking is active, grey when disabled
- **Hit counter** — tracks how many times each mock has been matched
- **Console log** — every intercepted request prints a one-line log in DevTools
- **Format JSON** — one-click prettify for response bodies
- **Search** — filter mocks by URL or label

---

## Installation (Developer Mode)

> Requires **Chrome 111+**

1. Clone or download this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `mock-extension/` folder
5. Click the extension icon in the toolbar to open the popup

---

## Usage

### Add a mock

1. Click **`+`** in the toolbar to add a new mock
2. Enter the **URL** to intercept (supports `*` wildcard, e.g. `https://api.example.com/*`)
3. Select the **HTTP method** (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
4. Set the desired **Status code** (default `200`)
5. Paste your **Response payload** in the editor
6. Toggle the mock **on** — changes save automatically

### Organise with groups

| Action | How |
|---|---|
| Create group | Click the **folder+** icon in the toolbar |
| Rename group | Double-click the group name |
| Add mock to group | Click **`+`** inside the group header |
| Move mock to group | Mock menu **⋮** → *Move to: [Group name]* |
| Collapse / expand | Click anywhere on the group header |
| Delete group | Group menu **⋮** → *Delete group* (mocks become ungrouped) |

### Global toggle

The toggle in the toolbar enables / disables **all** mocks at once. The extension icon reflects the current state:

- 🟠 **Orange** — mocking is active
- ⚫ **Grey + "OFF" badge** — mocking is disabled

### Console logging

Every intercepted request prints a single line in the browser DevTools console:

```
[API Mock] [POST] https://api.example.com/data — response is being mocked
```

---

## Project Structure

```
mock-extension/
├── manifest.json      # Manifest V3 config
├── background.js      # Service worker: state management, icon rendering
├── content.js         # Isolated-world bridge (postMessage ↔ chrome.runtime)
├── interceptor.js     # Main-world script: overrides fetch + XMLHttpRequest
├── popup.html         # Popup shell
├── popup.css          # Dark-theme styles
└── popup.js           # Popup UI: mocks, groups, auto-save, editor
```

### Architecture

```
 Page (MAIN world)          Extension (ISOLATED world)       Service Worker
 ─────────────────          ──────────────────────────       ──────────────
 interceptor.js             content.js                       background.js
       │                          │                                │
       │  postMessage             │  chrome.runtime.sendMessage    │
       │ ──────────────────────▶  │ ────────────────────────────▶  │
       │  (CHECK_MOCK req)        │                          match URL+method
       │                          │  ◀────────────────────────────  │
       │  ◀────────────────────── │  (mock data or null)            │
       │                                                             │
  return mock Response                                    chrome.storage.local
  or pass-through                                         (persist all mocks)
```

---

## Data Model

```typescript
interface Mock {
  id: string
  url: string           // supports * wildcard
  method: string        // GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS
  enabled: boolean
  statusCode: number
  delay: number         // milliseconds
  label: string         // optional display name
  responseBody: string  // JSON or plain text
  requestPayload: string
  responseHeaders: string // "Key: Value" lines
  groupId: string | null
  hitCount: number
}

interface Group {
  id: string
  name: string
  collapsed: boolean
}
```

---

## URL Matching Rules

| Pattern | Matches |
|---|---|
| `https://api.example.com/users` | Exact URL (with or without query string) |
| `https://api.example.com/*` | Any path under that origin |
| `https://api.example.com/users?*` | Any query string on that path |

When a pattern has **no query string**, the incoming URL is matched against its base path (query string stripped). When the pattern **includes** `?`, the full URL is matched.

---

## Tech Notes

- Uses `world: "MAIN"` in `content_scripts` (Chrome 111+) so `interceptor.js` can override native globals before any page script runs
- Icon is drawn at runtime via **OffscreenCanvas** in the service worker — no PNG assets required
- Storage via `chrome.storage.local` (5 MB limit; plenty for typical mock payloads)
