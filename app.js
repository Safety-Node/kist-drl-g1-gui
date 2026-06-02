// KIST G1 display renderer — vanilla, buildless.
//
// Consumes the workstation GUIBackground WebSocket (REQ-41 / kist-drl-g1-workstation):
//   - binary message : latest camera JPEG bytes
//   - text message   : status JSON { scenario, subtask:{name,i,n}, state }
// Keeps the latest frame + latest status independently and redraws on each
// animation frame. ROS-free. Auto-reconnects with exponential backoff.

(function () {
  "use strict";

  var WS_URL =
    (window.GUI_CONFIG && window.GUI_CONFIG.wsUrl) ||
    "ws://" + (location.hostname || "localhost") + ":8081";

  var canvas = document.getElementById("view");
  var ctx = canvas.getContext("2d");

  var latestFrame = null; // ImageBitmap | null
  var latestStatus = null; // status object | null
  var connState = "connecting"; // connecting | connected | reconnecting

  var STATE_COLOR = {
    idle: "#888888",
    active: "#2d7dff",
    success: "#2ecc71",
    failed: "#e74c3c",
  };

  // ---- canvas sizing (HiDPI-crisp) ----
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  window.addEventListener("resize", resize);
  resize();

  // Click / tap toggles fullscreen (Fullscreen API requires a user gesture,
  // so auto-fullscreen on load is not possible; for the wall display launch
  // the browser in kiosk mode instead). Esc exits, as usual.
  canvas.addEventListener("click", function () {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else {
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    }
  });

  // ---- WebSocket with exponential-backoff reconnect ----
  var backoff = 500;
  function connect() {
    var ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws.binaryType = "blob";
    ws.onopen = function () {
      connState = "connected";
      backoff = 500;
    };
    ws.onmessage = function (ev) {
      if (typeof ev.data === "string") {
        try {
          latestStatus = JSON.parse(ev.data);
        } catch (e) {
          /* ignore malformed status */
        }
      } else {
        createImageBitmap(ev.data)
          .then(function (bmp) {
            if (latestFrame && latestFrame.close) latestFrame.close();
            latestFrame = bmp;
          })
          .catch(function () {
            /* undecodable frame — keep previous */
          });
      }
    };
    ws.onerror = function () {
      try {
        ws.close();
      } catch (e) {}
    };
    ws.onclose = function () {
      connState = "reconnecting";
      scheduleReconnect();
    };
  }
  function scheduleReconnect() {
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 5000);
  }
  connect();

  // ---- drawing helpers (work in CSS pixels) ----
  function cssW() {
    return window.innerWidth;
  }
  function cssH() {
    return window.innerHeight;
  }

  function drawCover(bmp) {
    var W = cssW(),
      H = cssH();
    var s = Math.max(W / bmp.width, H / bmp.height);
    var dw = bmp.width * s,
      dh = bmp.height * s;
    ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  // Dark pill behind text. Returns nothing; caller manages the y cursor.
  function panel(text, x, y, align, font, fg) {
    ctx.font = font || "22px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    var m = ctx.measureText(text);
    var padX = 12,
      boxH = 32,
      boxY = y - 24;
    var boxX = align === "right" ? x - m.width - padX * 2 : x;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(boxX, boxY, m.width + padX * 2, boxH);
    ctx.fillStyle = fg || "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(text, boxX + padX, y);
  }

  function badge(text, x, y, color) {
    ctx.font = "bold 20px system-ui, sans-serif";
    var m = ctx.measureText(text);
    var padX = 12,
      h = 30;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 22, m.width + padX * 2, h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(text, x + padX, y);
  }

  function drawOverlay(s) {
    var pad = 24;

    // top-left: scenario + sub-task + state badge
    var y = pad + 28;
    if (s.scenario) {
      panel(s.scenario, pad, y, "left", "bold 28px system-ui, sans-serif");
      y += 44;
    }
    if (s.subtask) {
      var st = s.subtask;
      var label = st.name + "  (" + ((st.i | 0) + 1) + "/" + (st.n | 0) + ")";
      panel(label, pad, y, "left", "22px system-ui, sans-serif");
      y += 40;
    }
    var state = s.state || "idle";
    badge(state.toUpperCase(), pad, y, STATE_COLOR[state] || "#888888");
  }

  function drawConn() {
    var W = cssW(),
      H = cssH(),
      pad = 16;
    var map = {
      connected: ["#2ecc71", "LIVE"],
      connecting: ["#f1c40f", "CONNECTING"],
      reconnecting: ["#e67e22", "RECONNECTING"],
    };
    var c = map[connState] || map.connecting;
    ctx.font = "16px system-ui, sans-serif";
    var m = ctx.measureText(c[1]);
    var padX = 10,
      h = 26,
      w = m.width + padX * 2 + 22;
    var bx = W - pad - w,
      by = H - pad - h;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = c[0];
    ctx.beginPath();
    ctx.arc(bx + 14, by + h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(c[1], bx + 26, by + 18);
  }

  // ---- render loop ----
  function render() {
    var W = cssW(),
      H = cssH();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    if (latestFrame) {
      drawCover(latestFrame);
    } else {
      ctx.fillStyle = "#3a3f47";
      ctx.font = "bold 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("NO SIGNAL", W / 2, H / 2);
    }

    if (latestStatus) drawOverlay(latestStatus);
    drawConn();

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
