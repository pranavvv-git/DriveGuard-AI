# DriveGuard AI — *When You Drift, We Alert.*

AI-based driver drowsiness detection & alert system. This repository's web page is an interactive version of the project presentation:

- **How it works** – the 6-stage pipeline, explained step by step
- **Simulator** – drag the eye open/closed, trigger blinks and microsleeps, watch the decision logic react
- **Live demo** – runs in the browser with your webcam (MediaPipe Face Landmarker, all processing local)

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(The webcam needs `localhost` or HTTPS.)

## Publish on GitHub Pages

1. Put `index.html`, `style.css`, `script.js` in the repo root (or a `/docs` folder).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` (or `/docs`).
3. Your site appears at `https://<username>.github.io/<repo>/`.

Then edit the two links at the top of `script.js` (`CONFIG`) and add the site URL to your GitHub repo description and LinkedIn Featured section.

## How detection works

| Signal | Measure | Meaning |
|---|---|---|
| Eye closure | Eye Aspect Ratio `EAR = (‖p2−p6‖ + ‖p3−p5‖) / (2‖p1−p4‖)` | Closed longer than a normal blink |
| Yawning | Mouth Aspect Ratio (lip gap / mouth width) | Mouth held open |
| Head | Nose offset + eye-line tilt | Reduced attention |

Signals are accumulated over time into a risk score: 🟢 Normal → 🟡 Warning → 🔴 Drowsy (audio alert).
Thresholds in the web demo are illustrative and live in `script.js` (`T`).

## Python prototype

Python · OpenCV · MediaPipe · NumPy · Streamlit

> DriveGuard AI is an assistance tool. It does not replace driver attention or safe driving.

By Pranav Thakur 
