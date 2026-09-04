import time
import json
import random
import select
import sys
import math
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
damaged_node = None

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
print("Press [d] + Enter to simulate HARDWARE FAILURE (Node 3 dies)")
print("Press [n] + Enter to return to NORMAL state")
print("========================================")

# Initialize baseline tilt for 5 nodes
nodes = ["node_1", "node_2", "node_3", "node_4", "node_5"]
base_tilt = {node: 0.0 for node in nodes}

# Initial Battery setup (randomized slightly to look realistic)
battery_levels = {
    "node_1": 98.5,
    "node_2": 42.1,  # Simulating a node in the shade
    "node_3": 100.0,
    "node_4": 89.2,
    "node_5": 12.5   # Critical battery
}
# Only some nodes get enough sun to charge
solar_charging = {
    "node_1": True,
    "node_2": False,
    "node_3": True,
    "node_4": True,
    "node_5": False
}

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
        elif key == 'd':
            damaged_node = "node_3"
            print("\n💥 [SIMULATION] Node 3 has been CRUSHED! Radio offline.")
        elif key == 'n':
            state = "NORMAL"
            damaged_node = None
            print("\n✅ [SIMULATION] Returned to Normal.")
        
    current_time = time.time()
    elapsed = current_time - event_start_time

    payload = {
        "timestamp": current_time,
        "state": state,
        "nodes": {}
    }

    for node_id in nodes:
        # If node is damaged, completely skip it so it stops transmitting
        if node_id == damaged_node:
            continue
            
        # Simulate Battery Drain/Charge
        if solar_charging[node_id]:
            battery_levels[node_id] = min(100.0, battery_levels[node_id] + 0.001)
        else:
            battery_levels[node_id] = max(0.0, battery_levels[node_id] - 0.005)

        if state == "NORMAL":
            # Normal baseline noise (tiny random walk)
            base_tilt[node_id] += random.uniform(-0.0001, 0.0001)
            
        tilt = base_tilt[node_id]
        # Normal baseline vibration (virtually 0, just tiny geophone noise)
        vib = random.uniform(-0.1, 0.1)
        # Normal baseline acceleration
        tilt_accel = random.uniform(-0.001, 0.001)

        if state == "TRUCK":
            if elapsed < 15:
                # Gaussian Envelope for a vehicle passing (Peak PPV ~ 15 mm/s)
                # μ (mean) = 7.5 seconds (truck is closest)
                # σ (std dev) = 2.0 seconds
                envelope = math.exp(-((elapsed - 7.5) ** 2) / (2 * 2.0 ** 2))
                vib = envelope * random.uniform(-15.0, 15.0)
            else:
                state = "NORMAL"
                print("\n✅ Truck passed. Normalizing.")
        
        elif state == "BLASTING":
            if elapsed < 8:
                # Damped Harmonic Oscillator (Impulsive blast, high PPV ~ 60 mm/s)
                # V(t) = A * e^(-λt) * cos(ωt)
                freq = 15.0
                decay = 1.2
                peak_amplitude = 60.0
                vib = peak_amplitude * math.exp(-decay * elapsed) * math.cos(freq * elapsed)
                vib += random.uniform(-0.5, 0.5) # tiny sensor noise
            else:
                state = "NORMAL"
                print("\n✅ Blasting ring-down complete. Normalizing.")

        elif state == "COLLAPSE":
            # Saito's Tertiary Creep: Exponential acceleration
            tilt_accel = 0.005 * 0.5 * math.exp(elapsed * 0.5)
            tilt_vel = 0.005 * math.exp(elapsed * 0.5)
            base_tilt[node_id] += tilt_vel
            tilt = base_tilt[node_id]
            # Chaotic massive vibration during rock shear
            vib = random.uniform(-10.0, 10.0) * (1 + elapsed * 0.2)

        payload["nodes"][node_id] = {
            "tilt": round(tilt, 4),
            "vibration": round(vib, 4),
            "acceleration": round(tilt_accel, 6),
            "battery": round(battery_levels[node_id], 1),
            "charging": solar_charging[node_id]
        }

    # Publish JSON to MQTT
    client.publish(TOPIC, json.dumps(payload))
    
    # 10 Hz refresh rate for incredibly smooth UI graphing
    time.sleep(0.1)
