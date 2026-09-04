import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Map as MapIcon, HardHat, Cpu } from 'lucide-react';

// Jharia Coalfield Coordinates
const CENTER = [23.7431, 86.4190];

export default function App() {
  const [dataStream, setDataStream] = useState([]);
  const [currentData, setCurrentData] = useState(null);
  const [wsStatus, setWsStatus] = useState('Connecting...');
  
  // UX Features
  const [selectedNode, setSelectedNode] = useState('node_1');
  const [hasCollapsed, setHasCollapsed] = useState(false);
  const [isAlarmDismissed, setIsAlarmDismissed] = useState(false);
  const [showPlanningGrid, setShowPlanningGrid] = useState(false);
  const [isGridGenerated, setIsGridGenerated] = useState(false);

  // AHSM Planning Grid Data
  const riskZonePolygon = [
    [23.7460, 86.4130],
    [23.7460, 86.4240],
    [23.7390, 86.4240],
    [23.7390, 86.4130],
  ];

  const suggestedPlacements = [];
  // Increased density (smaller step size) for closer nodes
  for(let lat=23.7405; lat<=23.7445; lat+=0.0012) {
    for(let lng=86.4145; lng<=86.4225; lng+=0.0015) {
      suggestedPlacements.push([lat, lng]);
    }
  }

  const togglePlanner = () => {
    setShowPlanningGrid(!showPlanningGrid);
    setIsGridGenerated(false); // Reset grid when toggling
  };

  const nodes = [
    { id: 'node_1', pos: [23.7431, 86.4190] },
    { id: 'node_2', pos: [23.7450, 86.4210] },
    { id: 'node_3', pos: [23.7410, 86.4170] },
    { id: 'node_4', pos: [23.7440, 86.4150] },
    { id: 'node_5', pos: [23.7415, 86.4220] }
  ];

  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connectWS = () => {
      ws = new WebSocket('ws://localhost:8000/ws');
      
      ws.onopen = () => setWsStatus('Connected');
      
      ws.onclose = () => {
        setWsStatus('Disconnected');
        // Auto-reconnect every 2 seconds
        reconnectTimer = setTimeout(connectWS, 2000);
      };
      
      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setCurrentData(payload);
        
        // Latch the critical failure modal if it ever hits 100
        if (payload.global_anomaly_score === 100) {
          setHasCollapsed(true);
        }
        
        // Reset alarms ONLY when system explicitly returns to NORMAL
        if (payload.simulator_state === 'NORMAL') {
          setHasCollapsed(false);
          setIsAlarmDismissed(false);
        }
        
        setDataStream(prev => {
          const newData = [...prev, payload];
          if (newData.length > 50) return newData.slice(newData.length - 50);
          return newData;
        });
      };
    };

    connectWS();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const anomalyScore = currentData?.global_anomaly_score || 0;
  const isCritical = (anomalyScore === 100 || hasCollapsed) && !isAlarmDismissed;

  const getSystemStateDisplay = (state, score) => {
    switch(state) {
      case 'NORMAL': return { text: 'System Nominal', color: 'text-emerald-400', banner: null };
      case 'TRUCK': return { text: 'Transient Vibration Anomaly', color: 'text-yellow-400', banner: 'Notice: High transient surface vibration detected (Profile: Heavy Machinery). AI Risk Engine has classified this as non-threatening.' };
      case 'BLASTING': return { text: 'Seismic Shock Anomaly', color: 'text-orange-400', banner: 'Warning: Instantaneous seismic shock detected (Profile: Adjacent Blasting). Strata remains stable. No evacuation required.' };
      case 'COLLAPSE': 
        if (score === 100) return { text: 'Critical Strata Failure', color: 'text-red-500', banner: null };
        return { text: 'Sustained Strata Movement', color: 'text-orange-500', banner: 'Alert: Continuous strata acceleration detected. AI Risk Engine analyzing collapse probability...' };
      default: return { text: 'AWAITING DATA', color: 'text-slate-500', banner: null };
    }
  };

  const sysState = getSystemStateDisplay(currentData?.simulator_state, anomalyScore);

  // Chart data formatted dynamically based on selected node
  const chartData = dataStream.map(d => ({
    time: new Date(d.timestamp * 1000).toLocaleTimeString([], {minute: '2-digit', second:'2-digit'}),
    tilt: d.nodes[selectedNode]?.tilt || 0,
    vib: d.nodes[selectedNode]?.vibration || 0,
    accel: d.nodes[selectedNode]?.acceleration || 0,
  }));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      
      {/* HEADER */}
      <header className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
        <div className="flex items-center gap-3">
          <HardHat className="text-yellow-500 w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Project TerraGuard</h1>
            <p className="text-sm text-slate-400">DGMS Continuous Strata Monitoring System</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-right">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Site Location</span>
            <span className="font-semibold text-emerald-400">Jharia Coalfield, Panel 4</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold border ${wsStatus === 'Connected' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50' : 'bg-red-900/30 text-red-400 border-red-500/50'}`}>
            {wsStatus}
          </div>
        </div>
      </header>

      {/* WARNING BANNER FOR NON-CRITICAL ANOMALIES */}
      {sysState.banner && !isCritical && (
        <div className="bg-yellow-900/40 border border-yellow-500/50 rounded-lg p-3 mb-6 flex items-center gap-3 animate-pulse shadow-lg">
          <AlertTriangle className="text-yellow-500 w-5 h-5 flex-shrink-0" />
          <span className="text-yellow-200 text-sm font-mono">{sysState.banner}</span>
        </div>
      )}

      {/* DGMS CRITICAL ALERT MODAL */}
      {hasCollapsed && !isAlarmDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border-2 border-red-500 p-8 rounded-2xl shadow-2xl max-w-2xl w-full text-center animate-pulse">
            <AlertTriangle className="w-24 h-24 text-red-500 mx-auto mb-6" />
            <h2 className="text-4xl font-black text-red-500 mb-2">EARLY WARNING ALERT</h2>
            <h3 className="text-2xl font-bold text-white mb-6">Onset of Tertiary Creep Predicted (Panel 4)</h3>
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg mb-6 text-left">
              <p className="text-red-300 font-mono text-sm leading-relaxed">
                [AI PREDICTION LOG]: Hyperbolic acceleration d²θ/dt² exceeded safety threshold (0.05°/s²). 
                High probability of surface breakthrough within 72-120 hours. Initiating DGMS Level 3 Preventative Evacuation Protocol.
              </p>
            </div>
            <p className="text-xl font-bold text-white uppercase tracking-widest mb-4">Initiate Controlled Site Evacuation</p>
            <button 
              onClick={() => setIsAlarmDismissed(true)} 
              className="mt-4 px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 text-sm"
            >
              Acknowledge & Dismiss Alarm
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Map & AI Engine */}
        <div className="space-y-6">
          
          <div className={`bg-slate-800 rounded-xl border p-5 shadow-lg transition-colors duration-500 ${isCritical ? 'border-red-500 shadow-red-900/50' : 'border-slate-700'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cpu className="text-blue-400 w-5 h-5" />
                <h2 className="text-lg font-semibold text-white">AI Risk Assessment Engine</h2>
              </div>
            </div>
            
            <div className="flex items-end gap-4 mb-2">
              <div className="text-5xl font-black tabular-nums" style={{ color: anomalyScore > 50 ? '#ef4444' : '#10b981' }}>
                {anomalyScore}%
              </div>
              <div className="text-sm text-slate-400 mb-1 uppercase tracking-wider">Subsidence Risk Score</div>
            </div>
            
            <div className="w-full bg-slate-900 rounded-full h-3 mb-4 overflow-hidden border border-slate-700">
              <div className={`h-3 rounded-full transition-all duration-300 ${anomalyScore > 50 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${anomalyScore}%` }}></div>
            </div>

            <div className="bg-slate-900 rounded-lg p-3 text-sm font-mono border border-slate-700 mt-2">
              <div className="flex justify-between mb-2 pb-2 border-b border-slate-800">
                <span className="text-slate-500">System State:</span>
                <span className={sysState.color}>
                  {sysState.text}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-slate-500">Selected Node:</span>
                <span className="text-slate-300">{selectedNode.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">d²θ/dt² Accel:</span>
                <span className="text-blue-400">{currentData?.nodes[selectedNode]?.acceleration || 0} °/s²</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapIcon className="text-emerald-400 w-5 h-5" />
                <h2 className="text-lg font-semibold text-white">Live Deployment Map</h2>
              </div>
              <button 
                onClick={togglePlanner}
                className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${showPlanningGrid ? 'bg-blue-900/50 text-blue-400 border-blue-500' : 'bg-slate-700 text-slate-300 border-slate-600'} hover:bg-slate-600`}
              >
                {showPlanningGrid ? 'Close AHSM Planner' : 'Open AHSM Planner'}
              </button>
            </div>
            <div className="h-[350px] rounded-lg overflow-hidden border border-slate-700 relative">
              
              {/* INTERACTIVE PLANNING MOCK FORM */}
              {showPlanningGrid && !isGridGenerated && (
                <div className="absolute top-2 left-2 z-[400] bg-slate-900/95 border border-slate-600 p-4 rounded-lg shadow-xl backdrop-blur-sm text-sm font-mono w-64">
                  <h3 className="text-emerald-400 font-bold mb-3 border-b border-slate-700 pb-2">AHSM Parameters</h3>
                  
                  <div className="mb-3">
                    <label className="text-slate-400 block mb-1 text-xs">Mine Location (Lat, Lng)</label>
                    <input type="text" defaultValue={"23.7431, 86.4190"} className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white outline-none focus:border-blue-500" />
                  </div>

                  <div className="mb-3">
                    <label className="text-slate-400 block mb-1 text-xs">Extraction Depth (m)</label>
                    <input type="number" defaultValue={450} className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white outline-none focus:border-blue-500" />
                  </div>
                  
                  <div className="mb-3">
                    <label className="text-slate-400 block mb-1 text-xs">Seam Thickness (m)</label>
                    <input type="number" defaultValue={4.5} className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white outline-none focus:border-blue-500" />
                  </div>
                  
                  <div className="mb-3">
                    <label className="text-slate-400 block mb-1 text-xs">Overburden Type</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white outline-none focus:border-blue-500">
                      <option>Hard Sandstone (22°)</option>
                      <option>Soft Alluvium (45°)</option>
                      <option>Shale Mix (35°)</option>
                    </select>
                  </div>
                  
                  <button 
                    onClick={() => setIsGridGenerated(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded mt-2 transition-colors"
                  >
                    Calculate & Draw Grid
                  </button>
                </div>
              )}

              {/* READOUT AFTER GENERATION */}
              {showPlanningGrid && isGridGenerated && (
                <div className="absolute top-2 left-2 z-[400] bg-slate-900/95 border border-slate-600 p-4 rounded-lg shadow-xl backdrop-blur-sm text-sm font-mono w-72 flex flex-col max-h-[90%]">
                  <h3 className="text-emerald-400 font-bold mb-2 border-b border-slate-700 pb-2">AHSM Deployment Manifest</h3>
                  <div className="text-xs text-slate-300 mb-3 space-y-1">
                    <p><span className="text-slate-500">Target:</span> Jharia Panel 4</p>
                    <p><span className="text-slate-500">Angle of Draw:</span> 22°</p>
                    <p><span className="text-slate-500">Required Nodes:</span> {suggestedPlacements.length}</p>
                  </div>
                  
                  <h4 className="text-slate-400 text-xs font-bold mb-2 uppercase tracking-wider">Optimal GPS Coordinates</h4>
                  <div className="overflow-y-auto flex-1 border border-slate-700 rounded bg-slate-950 p-2 space-y-1 max-h-48 custom-scrollbar">
                    {suggestedPlacements.map((pos, i) => (
                      <div key={i} className="text-[10px] flex justify-between border-b border-slate-800/50 pb-1">
                        <span className="text-slate-500">AHSM-{i+1 < 10 ? `0${i+1}` : i+1}</span>
                        <span className="text-blue-400">{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</span>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => setIsGridGenerated(false)}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 rounded mt-3 transition-colors"
                  >
                    Modify Parameters
                  </button>
                </div>
              )}

              <MapContainer center={CENTER} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution="Tiles &copy; Esri"
                />
                
                {/* AHSM Planning Overlays */}
                {showPlanningGrid && isGridGenerated && (
                  <>
                    <Polygon 
                      positions={riskZonePolygon} 
                      pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.1, dashArray: '5, 10', weight: 2 }} 
                    />
                    {suggestedPlacements.map((pos, i) => (
                      <Circle 
                        key={`sugg_${i}`} 
                        center={pos} 
                        radius={15} 
                        pathOptions={{ color: '#3b82f6', fillOpacity: 0.15, weight: 1.5, dashArray: '3, 3' }} 
                      />
                    ))}
                  </>
                )}
                {nodes.map(node => (
                  <CircleMarker
                    key={node.id}
                    center={node.pos}
                    radius={isCritical ? 12 : 8}
                    eventHandlers={{ click: () => setSelectedNode(node.id) }}
                    pathOptions={{
                      color: selectedNode === node.id ? '#3b82f6' : (isCritical ? '#ef4444' : '#10b981'),
                      fillColor: selectedNode === node.id ? '#3b82f6' : (isCritical ? '#ef4444' : '#10b981'),
                      fillOpacity: selectedNode === node.id ? 1 : 0.7,
                      className: isCritical ? 'animate-ping' : ''
                    }}
                  >
                    <Popup className="bg-slate-800 text-white border-slate-700">
                      <strong>{node.id.toUpperCase()}</strong><br/>
                      Click to view telemetry
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">Click a node on the map to switch telemetry view</p>
          </div>
        </div>

        {/* RIGHT COLUMN: Charts */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg p-5 flex flex-col justify-between">
             <div className="flex justify-between items-center mb-4">
               <h2 className="text-lg font-semibold text-white">Vibration Telemetry</h2>
               <select 
                 value={selectedNode} 
                 onChange={(e) => setSelectedNode(e.target.value)}
                 className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2 outline-none"
               >
                 {nodes.map(n => <option key={n.id} value={n.id}>{n.id.replace('_', ' ').toUpperCase()}</option>)}
               </select>
             </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{fontSize: 12}} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{backgroundColor: '#1e293b', border: '1px solid #334155'}} />
                  <Line type="monotone" dataKey="vib" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Tilt Telemetry ({selectedNode.replace('_', ' ').toUpperCase()})</h2>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{fontSize: 12}} />
                  <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{backgroundColor: '#1e293b', border: '1px solid #334155'}} />
                  <Line type="monotone" dataKey="tilt" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
