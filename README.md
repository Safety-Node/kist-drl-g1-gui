# kist-drl-g1-gui

Browser **display renderer** for the KIST DRL Unitree-G1 demo (REQ-49 / TASK-49).

Subscribes to the workstation `GUIBackground` WebSocket publisher (REQ-41,
`kist-drl-g1-workstation`) and draws the camera frame + status overlay on a
fullscreen canvas. **Vanilla HTML/JS — no build step, ROS-free.**

The workstation only *publishes data*; all compositing/overlay/rendering lives
here (rendering concern split out of the workstation).

## Run

Serve the static files and open in a browser:

```bash
python3 -m http.server 8080
# open: http://localhost:8080/?ws=ws://<workstation-ip>:8081
```

Default WS URL is `ws://<page-host>:8081`; override with the `?ws=` query param.

### Local dev without the workstation

```bash
pip install websockets pillow
python tools/mock_publisher.py        # fake publisher on ws://localhost:8081
# then: python3 -m http.server 8080  and open  http://localhost:8080/?ws=ws://localhost:8081
```

You should see a moving blob (mock camera), the `move_test` overlay, a periodic
E-STOP banner, and a TTS "말하는 중" blink — and the renderer should
auto-reconnect if you stop/restart the mock.

## WebSocket message contract

Source of truth: workstation **REQ-41 / GUIBackground**. Per frame tick the
server sends two messages to each connected client:

- **binary**: latest camera JPEG bytes (omitted until a frame exists)
- **text (JSON)**:

  ```json
  {
    "scenario": "move_test",
    "subtask": { "name": "go_fridge", "i": 1, "n": 4 },
    "state": "active",
    "estop": false,
    "stt": "STREAMING",
    "tts": false
  }
  ```

  - `state` ∈ `idle | active | success | failed`
  - `subtask.i` is **0-based** (the renderer displays `i+1/n`)
  - `subtask` is `null` when idle

The renderer keeps the latest frame and latest status independently and redraws
on each animation frame.

## Files

| File | Role |
|------|------|
| `index.html` | canvas host |
| `app.js` | WS client + reconnect + render loop + overlay |
| `config.js` | WS URL (`?ws=` override) |
| `style.css` | fullscreen layout |
| `tools/mock_publisher.py` | local dev WS publisher (no workstation needed) |

## Contributing

PRs squash-merged to `main`. CI (`.github/workflows/pr-meta.yml`) enforces:

- Branch: `TASK-{number}` (Notion-linked) or `chore/{description}`
- PR title: `([TASK-{number}] | [chore]) <type>(<scope>)?: <lowercase subject>`
