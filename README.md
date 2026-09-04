# Project TerraGuard - DGMS Continuous Strata Monitoring System

This is the hackathon prototype for an AI-powered early warning system for mine subsidence and tertiary creep prediction. 

It consists of a real-time hardware simulator, a FastAPI Python backend utilizing mocked ML Isolation Forest logic, and a dynamic React/Tailwind frontend dashboard.

## System Requirements
- **Python 3.10+**
- **Node.js 18+ & npm**

---

## 1. Quick Start (Terminal 1 - Backend)

First, set up the python environment and run the backend server. The backend connects to an MQTT broker to receive live telemetry from the sensors and serves the AI predictions via WebSocket to the frontend.

```bash
# Navigate to the project root
cd mine-subsidence-platform

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install the required Python packages
pip install fastapi uvicorn paho-mqtt websockets

# Run the FastAPI server
cd backend
python main.py
```
*(The backend runs on `http://localhost:8000`)*

---

## 2. Quick Start (Terminal 2 - Frontend)

Next, start the React dashboard.

```bash
# Open a new terminal and navigate to the frontend directory
cd mine-subsidence-platform/frontend

# Install node modules
npm install

# Start the Vite development server
npm run dev
```
*(The frontend runs on `http://localhost:5173`. Open this in your browser to view the dashboard!)*

---

## 3. Running the Hardware Simulator (Terminal 3)

The dashboard will say "AWAITING DATA" until you start the hardware simulator. The simulator feeds live simulated MQTT data (tilt and vibration) to the backend.

```bash
# Open a third terminal
cd mine-subsidence-platform

# Make sure your virtual environment is active!
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Run the interactive simulator
python simulator/sensor_mesh.py
```

### Simulator Controls
Once the simulator is running, it will constantly feed "NORMAL" baseline data. You can press the following keys + `Enter` in the simulator terminal to trigger edge cases and view the AI's response on the frontend:

- `t` - Simulates a heavy **Truck** passing by (massive vibration, no tilt). The AI filters this as non-threatening.
- `b` - Simulates adjacent **Blasting** (instant shockwave). The AI filters this as non-threatening.
- `c` - Simulates **Collapse / Tertiary Creep** (exponentially accelerating strata tilt). The AI catches this and triggers the DGMS Evacuation Protocol.
- `n` - Returns the simulator to the **Normal** baseline state.

---

## Technical Architecture Notes
- **MQTT**: The hardware simulator publishes to `terraguard/hackathon/panel4/telemetry/998877` on the public `broker.emqx.io` broker. The backend subscribes to this topic.
- **WebSocket**: The React frontend connects to `ws://localhost:8000/ws` for sub-second telemetry and AI state updates. It features auto-reconnect capabilities.
