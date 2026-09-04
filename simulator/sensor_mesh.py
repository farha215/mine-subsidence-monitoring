import time
import json
import random
import select
import sys
import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
PORT = 1883
TOPIC = "terraguard/hackathon/panel4/telemetry/998877"

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ Connected to MQTT Broker!")
        print("📡 Broadcasting to topic:", TOPIC)
    else:
        print("❌ Failed to connect, return code %d\n", rc)

# Initialize MQTT Client
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.connect(BROKER, PORT, 60)
client.loop_start()

state = "NORMAL"
event_start_time = 0

# Helper to read non-blocking input from terminal
def get_key():
    dr, dw, de = select.select([sys.stdin], [], [], 0)
    if dr:
        return sys.stdin.read(1).lower()
    return None

print("========================================")
print("🚀 Mine Subsidence Sensor Simulator 🚀")
print("========================================")
print("Press [t] + Enter to simulate a TRUCK driving by")
print("Press [b] + Enter to simulate BLASTING in adjacent mine")
print("Press [c] + Enter to simulate COLLAPSE (Tertiary Creep)")
print("Press [n] + Enter to return to NORMAL state")
print("========================================")

# Initialize baseline tilt for 5 nodes
nodes = ["node_1", "node_2", "node_3", "node_4", "node_5"]
base_tilt = {node: 0.0 for node in nodes}

while True:
    key = get_key()
    if key:
        # Strip newline character that comes from hitting Enter
        key = key.strip()
        if key == 't':
            state = "TRUCK"
            event_start_time = time.time()
            print("\n🚨 [SIMULATION] Heavy 100-ton Truck passing overhead...")
        elif key == 'b':
            state = "BLASTING"
            event_start_time = time.time()
            print("\n🚨 [SIMULATION] Explosive Blasting shockwave detected!")
        elif key == 'c':
            state = "COLLAPSE"
            event_start_time = time.time()
            print("\n☠️ [SIMULATION] TERTIARY CREEP INITIATED! Ground is failing...")
        elif key == 'n':
            state = "NORMAL"
            print("\n✅ [SIMULATION] Returned to Normal.")
        
    current_time = time.time()
    elapsed = current_time - event_start_time

    payload = {
        "timestamp": current_time,
        "state": state,
        "nodes": {}
    }

    for node_id in nodes:
        if state == "NORMAL":
            # Normal baseline noise (tiny random walk)
            base_tilt[node_id] += random.uniform(-0.0001, 0.0001)
            
        tilt = base_tilt[node_id]
        vib = random.uniform(0.1, 0.5)

        if state == "TRUCK":
            if elapsed < 5:
                # Truck rumbles for 5 seconds (high vibration, no permanent tilt)
                vib = random.uniform(8.0, 15.0)
            else:
                state = "NORMAL"
                print("\n✅ Truck passed. Normalizing.")
        
        elif state == "BLASTING":
            if elapsed < 5:
                # Instantaneous shockwave (massive vibration, no tilt)
                vib = random.uniform(40.0, 60.0)
            else:
                state = "NORMAL"
                print("\n✅ Blasting complete. Normalizing.")

        elif state == "COLLAPSE":
            # Saito's Tertiary Creep: Exponential acceleration
            # Start with a tiny velocity that grows exponentially, so acceleration is smooth
            tilt_vel = 0.005 * (2.718 ** (elapsed * 0.5))
            base_tilt[node_id] += tilt_vel
            tilt = base_tilt[node_id]
            
            # Vibration increases as rock grinds and snaps
            vib = random.uniform(2.0, 5.0) + (elapsed * 0.5)

        payload["nodes"][node_id] = {
            "tilt": round(tilt, 4),
            "vibration": round(vib, 4)
        }

    # Publish JSON to MQTT
    client.publish(TOPIC, json.dumps(payload))
    
    # 10 Hz refresh rate for incredibly smooth UI graphing
    time.sleep(0.1)
