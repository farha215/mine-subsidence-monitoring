import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BROKER = "broker.emqx.io"
PORT = 1883
TOPIC = "antigravity/hackathon/panel4/telemetry/998877"

# Store connected websocket clients (the frontend dashboard)
connected_clients = set()

# AI/Math State variables
previous_tilts = {}
previous_tilt_velocities = {}
node_max_scores = {}

def process_ai_logic(payload):
    """
    This function implements the CIMFR Saito's Method for Tertiary Creep.
    We calculate velocity (dθ/dt) and acceleration (d²θ/dt²).
    If a truck passes (high vib, 0 tilt), Anomaly Score is LOW (AI filters it).
    If Tertiary Creep starts (accelerating tilt), Anomaly Score is HIGH.
    """
    global previous_tilts, previous_tilt_velocities, node_max_scores

    
    nodes = payload.get("nodes", {})
    state = payload.get("state", "NORMAL")
    processed_nodes = {}
    
    max_anomaly_score = 0
    
    if state == "NORMAL":
        node_max_scores.clear()
    
    for node_id, data in nodes.items():
        tilt = data["tilt"]
        vib = data["vibration"]
        
        # Calculate velocity (dθ/dt)
        prev_tilt = previous_tilts.get(node_id, tilt)
        velocity = tilt - prev_tilt
        
        # Calculate acceleration (d²θ/dt²)
        prev_vel = previous_tilt_velocities.get(node_id, velocity)
        acceleration = velocity - prev_vel
        
        # Update state for next tick
        previous_tilts[node_id] = tilt
        previous_tilt_velocities[node_id] = velocity
        
        # AI Anomaly Scoring Logic
        anomaly_score = 0
        
        # If there's high vibration but NO tilt acceleration (Truck/Blasting)
        if vib > 5.0 and abs(acceleration) < 0.001:
            # The AI recognizes this as machinery noise. Risk is 0.
            anomaly_score = 5 
            
        # If there's accelerating tilt (Tertiary Creep)
        elif acceleration > 0.001:
            # Exponentially increase the anomaly score based on acceleration
            anomaly_score = min(100, int((acceleration / 0.05) * 100))
        
        # Ensure score is monotonically increasing during a collapse (prevent math jitter drops)
        if state == "COLLAPSE":
            node_max_scores[node_id] = max(node_max_scores.get(node_id, 0), anomaly_score)
            anomaly_score = node_max_scores[node_id]
        
        max_anomaly_score = max(max_anomaly_score, anomaly_score)
        
        processed_nodes[node_id] = {
            "tilt": tilt,
            "vibration": vib,
            "acceleration": round(acceleration, 5),
            "anomaly_score": anomaly_score
        }
        
    return {
        "timestamp": payload["timestamp"],
        "simulator_state": payload["state"], # TRUCK, BLASTING, COLLAPSE
        "global_anomaly_score": max_anomaly_score,
        "nodes": processed_nodes
    }

# MQTT Callbacks
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("Backend connected to MQTT Broker!")
        client.subscribe(TOPIC)
    else:
        print(f"Failed to connect, return code {rc}")

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        
        # Run the AI logic on the raw data
        processed_data = process_ai_logic(payload)
        
        # Broadcast to all connected React dashboards
        if connected_clients:
            asyncio.run(broadcast_to_clients(processed_data))
            
    except Exception as e:
        print(f"Error processing message: {e}")

async def broadcast_to_clients(data):
    disconnected = set()
    for client in connected_clients:
        try:
            await client.send_json(data)
        except Exception:
            disconnected.add(client)
            
    for client in disconnected:
        connected_clients.remove(client)

# Initialize MQTT Client in a background thread
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.connect(BROKER, PORT, 60)
mqtt_client.loop_start()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
