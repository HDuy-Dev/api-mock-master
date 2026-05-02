/**
 * Runs in the ISOLATED world.
 * Bridges postMessage from the page (interceptor.js) to chrome.runtime (background.js).
 */
window.addEventListener('message', async (ev) => {
  if (ev.source !== window || !ev.data || ev.data.type !== '__MOCK_MASTER_REQ__') return;

  const { id, url, method } = ev.data;
  try {
    const mock = await chrome.runtime.sendMessage({ type: 'GET_MOCK', url, method });
    window.postMessage({ type: '__MOCK_MASTER_RESP__', id, mock: mock || null }, '*');
  } catch (_) {
    window.postMessage({ type: '__MOCK_MASTER_RESP__', id, mock: null }, '*');
  }
});
