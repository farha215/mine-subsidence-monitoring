import json
import asyncio
import time
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
TOPIC = "terraguard/hackathon/panel4/telemetry/998877"

# Store connected websocket clients (the frontend dashboard)
connected_clients = set()

# AI/Math State variables
previous_tilts = {}
previous_tilt_velocities = {}
node_max_scores = {}
node_last_seen = {}

ALL_NODES = ["node_1", "node_2", "node_3", "node_4", "node_5"]

def process_ai_logic(payload):
    """
    This function implements the CIMFR Saito's Method for Tertiary Creep.
    It also implements a Hardware Heartbeat Monitor to detect if a sensor goes offline.
    """
    global previous_tilts, previous_tilt_velocities, node_max_scores, node_last_seen

    incoming_nodes = payload.get("nodes", {})
    state = payload.get("state", "NORMAL")
    processed_nodes = {}
    current_time = time.time()
    
    max_anomaly_score = 0
    
    if state == "NORMAL":
        node_max_scores.clear()
    
    for node_id in ALL_NODES:
        if node_id in incoming_nodes:
            # Node is alive!
            node_last_seen[node_id] = current_time
            
            data = incoming_nodes[node_id]
            tilt = data["tilt"]
            vib = data["vibration"]
            battery = data.get("battery", 100.0)
            charging = data.get("charging", False)
            
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
                anomaly_score = 5 
                
            # If there's accelerating tilt (Tertiary Creep)
            elif acceleration > 0.001:
                anomaly_score = min(100, int((acceleration / 0.05) * 100))
            
            # Ensure score is monotonically increasing during a collapse
            if state == "COLLAPSE":
                node_max_scores[node_id] = max(node_max_scores.get(node_id, 0), anomaly_score)
                anomaly_score = node_max_scores[node_id]
            
            max_anomaly_score = max(max_anomaly_score, anomaly_score)
            status = "ONLINE"
            
        else:
            # Node is missing from this packet. Check if it's dead.
            last_seen = node_last_seen.get(node_id, 0)
            # If we haven't seen it in 3 seconds (simulator sends every 0.1s), it's dead.
            if current_time - last_seen > 3.0:
                status = "OFFLINE"
            else:
                # It just missed a packet, assume it's still online for now
                status = "ONLINE"
                
            # Fallback to zeros/last known if offline to prevent crashing math
            tilt = previous_tilts.get(node_id, 0.0)
            vib = 0.0
            acceleration = 0.0
            anomaly_score = 0
            battery = 0.0
            charging = False

        processed_nodes[node_id] = {
            "status": status,
            "tilt": tilt,
            "vibration": vib,
            "acceleration": round(acceleration, 5),
            "anomaly_score": anomaly_score,
            "battery": battery,
            "charging": charging
        }
        
    return {
        "timestamp": payload.get("timestamp", current_time),
        "simulator_state": state, # TRUCK, BLASTING, COLLAPSE
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
