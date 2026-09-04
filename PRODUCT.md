# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React (Vite), Vite, Vanilla CSS. Backend: FastAPI, MQTT, Python.

## Users
Mining engineers, safety officers, and fleet operators working in remote or offline environments.

## Product Purpose
A local, fully offline hardware-integrated platform (T-Minus) to monitor mine subsidence in real time. It ensures safety by tracking sensor node health, telemetry (tilt, battery, solar), and anomalies.

## Positioning
An offline-first, highly robust industrial safety dashboard with real-time hardware telemetry integration, avoiding cloud dependency for maximum reliability.

## Operating Context
Used in control rooms or on rugged laptops in the field. Needs to be professional, clean, and highly scannable to quickly identify fleet issues or subsidence warnings. 

## Capabilities and Constraints
- Must function completely offline.
- Integrates with ESP32/MPU6050/nRF24L01 hardware fleet.
- Uses MQTT for telemetry and WebSockets for real-time dashboard updates.
- Constraints: No generic "WiFi" icons (use signal/alert icons), must be a light mode dashboard, must look professional/corporate, panels/modals instead of everything on one page.

## Brand Commitments
- "Corporate Light Mode" aesthetics.
- Cleaner, more professional, less "AI-generated" look.
- Uses Impeccable Design vocabulary.

## Evidence on Hand
- `frontend/src/App.jsx` handles real-time WebSockets and Modals (Fleet Health, AHSM Planner).
- Simulator `sensor_mesh.py` injecting data.
- Backend `main.py` doing Saito's method and heartbeat monitoring.

## Product Principles
1. **Safety Critical & Reliable:** The UI must clearly highlight offline nodes, battery issues, and tilt anomalies.
2. **Decluttered & Focused:** Use modals and panels to keep the main view clean and professional.
3. **Offline & Context-Aware:** Design language reflects a professional industrial tool, avoiding consumer-level fluff or inappropriate icons.

## Accessibility & Inclusion
High contrast for light mode, clear scannability for fast response to alerts.
