// Display renderer config.
// Override the WebSocket URL with a ?ws= query param, e.g.
//   index.html?ws=ws://192.168.0.10:8081
// Default: same host as this page, GUIBackground's default port 8081.
window.GUI_CONFIG = {
  wsUrl:
    new URLSearchParams(location.search).get("ws") ||
    "ws://" + (location.hostname || "localhost") + ":8081",
};
