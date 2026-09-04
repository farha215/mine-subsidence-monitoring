import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Circle, ImageOverlay } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Map as MapIcon, HardHat, Cpu, Battery, BatteryCharging, Signal, AlertCircle, Activity, X, ArrowRight, Layers, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  
  // Slide Panels instead of Modals
  const [activePanel, setActivePanel] = useState(null); // 'fleet', 'ahsm', or null
  const [isGridGenerated, setIsGridGenerated] = useState(false);

  // Geotechnical States
  const [extractionMethod, setExtractionMethod] = useState('Traditional Pillar');
  const [showDinsar, setShowDinsar] = useState(false);
  const [mineDepth, setMineDepth] = useState(150);
  const [seamThickness, setSeamThickness] = useState(4.5);
  const [keyStratumDepth, setKeyStratumDepth] = useState(50);
  const [drawAngleStr, setDrawAngleStr] = useState("45"); // "45", "35", "22"

  // Live nodes clustered tightly (exactly 100m apart in a micro-array cross formation)
  const nodes = [
    { id: 'node_1', pos: [23.7431, 86.4190] }, // Center
    { id: 'node_2', pos: [23.7440, 86.4190] }, // North (100m)
    { id: 'node_3', pos: [23.7422, 86.4190] }, // South (100m)
    { id: 'node_4', pos: [23.7431, 86.4199] }, // East (100m)
    { id: 'node_5', pos: [23.7431, 86.4181] }  // West (100m)
  ];

  // AHSM Polygon Math (Hyperbolic Subsidence Trough)
  const riskZonePolygon = useMemo(() => {
    const points = [];
    const centerX = CENTER[0];
    const centerY = CENTER[1];
    const metersToDeg = 1 / 111111; 
    const drawAngleRad = parseFloat(drawAngleStr) * (Math.PI / 180);
    const extentMeters = mineDepth * Math.tan(drawAngleRad);
    
    // Hyperbola vertices stretch (assume underlying panel is 200m x 100m)
    const semiMajorMeters = 100 + extentMeters; 
    const semiMinorMeters = 50 + extentMeters;

    // Draw an ellipse to approximate the hyperbolic trough on the surface
    for (let i = 0; i <= 360; i += 5) {
      const rad = i * (Math.PI / 180);
      const lat = centerX + (semiMajorMeters * Math.cos(rad) * metersToDeg);
      const lng = centerY + (semiMinorMeters * Math.sin(rad) * metersToDeg);
      points.push([lat, lng]);
    }
    return points;
  }, [mineDepth, drawAngleStr]);

  const suggestedPlacements = useMemo(() => {
    const placements = [];
    if (!isGridGenerated) return placements;
    
    const metersToDeg = 1 / 111111;
    const drawAngleRad = parseFloat(drawAngleStr) * (Math.PI / 180);
    const extentMeters = mineDepth * Math.tan(drawAngleRad);
    const semiMajorMeters = 100 + extentMeters; 
    const semiMinorMeters = 50 + extentMeters;
    
    const boundsDegLat = semiMajorMeters * metersToDeg;
    const boundsDegLng = semiMinorMeters * metersToDeg;
    
    // Space sensors denser near inflection points (closer to the edges)
    for(let lat = CENTER[0] - boundsDegLat; lat <= CENTER[0] + boundsDegLat; lat += 0.0009) {
      for(let lng = CENTER[1] - boundsDegLng; lng <= CENTER[1] + boundsDegLng; lng += 0.0009) {
        // Check if inside ellipse
        const dx = (lat - CENTER[0]) / boundsDegLat;
        const dy = (lng - CENTER[1]) / boundsDegLng;
        if (dx*dx + dy*dy <= 1.0) {
           placements.push([lat, lng]);
        }
      }
    }
    return placements;
  }, [mineDepth, drawAngleStr, isGridGenerated]);

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
          // 5 seconds of short-term memory (10Hz = 50 data points)
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

  // Use current data for the dashboard
  const displayData = currentData;
  const anomalyScore = displayData?.global_anomaly_score || 0;
  const isCritical = (anomalyScore === 100 || hasCollapsed) && !isAlarmDismissed;

  const getSystemStateDisplay = (state, score) => {
    switch(state) {
      case 'NORMAL': return { text: 'NOMINAL', color: 'text-emerald-700', banner: null };
      case 'TRUCK': return { text: 'TRANSIENT VIBRATION', color: 'text-yellow-700', banner: 'Notice: High transient surface vibration detected (Profile: Heavy Machinery). AI Risk Engine has classified this as non-threatening.' };
      case 'BLASTING': return { text: 'SEISMIC SHOCK', color: 'text-orange-700', banner: 'Warning: Instantaneous seismic shock detected (Profile: Adjacent Blasting). Strata remains stable. No evacuation required.' };
      case 'COLLAPSE': 
        if (score === 100) return { text: 'CRITICAL FAILURE', color: 'text-red-700', banner: null };
        return { text: 'SUSTAINED MOVEMENT', color: 'text-orange-700', banner: 'Alert: Continuous strata acceleration detected. AI Risk Engine analyzing collapse probability.' };
      default: return { text: 'AWAITING DATA', color: 'text-slate-900', banner: null };
    }
  };

  const sysState = getSystemStateDisplay(displayData?.simulator_state, anomalyScore);

  const chartData = dataStream.map(d => ({
    time: new Date(d.timestamp * 1000).toLocaleTimeString([], {minute: '2-digit', second:'2-digit'}),
    tilt: d.nodes[selectedNode]?.tilt || 0,
    vib: d.nodes[selectedNode]?.vibration || 0,
    accel: d.nodes[selectedNode]?.acceleration || 0,
  }));

  // Dynamic AI Thresholds based on Extraction Method
  const tiltThreshold = extractionMethod === 'Wide Stall' ? 1.5 : 0.5;
  const vibThreshold = extractionMethod === 'Wide Stall' ? 25.0 : 15.0;

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900 font-sans flex flex-col relative overflow-hidden selection:bg-cyan-200">
      
      {/* HEADER - Rigid, full width, sharp borders */}
      <header className="flex justify-between items-center bg-slate-100 border-b-2 border-slate-900 px-6 py-4 z-20">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-sky-300 border-2 border-slate-900 shadow-[4px_4px_0px_rgba(15,23,42,1)]">
            <HardHat className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase leading-none">T-Minus</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Subsidence Platform</p>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          

          <div className="flex flex-col text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Location</span>
            <span className="text-sm font-bold text-slate-900 uppercase">Jharia Panel 4</span>
          </div>
          
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Uplink</span>
            <span className={`text-sm font-bold uppercase flex items-center justify-end gap-2 ${wsStatus === 'Connected' ? 'text-emerald-700' : 'text-red-700'}`}>
              {wsStatus === 'Connected' && <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></div>}
              {wsStatus}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-300"></div>

          <button 
            onClick={() => setActivePanel(activePanel === 'fleet' ? null : 'fleet')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest border-2 border-slate-900 transition-all ${activePanel === 'fleet' ? 'bg-sky-300 text-slate-900 shadow-[4px_4px_0px_rgba(15,23,42,1)]' : 'bg-slate-100 text-slate-900 hover:bg-sky-300 hover:shadow-[4px_4px_0px_rgba(15,23,42,1)] translate-x-[2px] translate-y-[2px] hover:translate-x-0 hover:translate-y-0'}`}
          >
            <Activity className="w-4 h-4" /> Fleet Status
          </button>
        </div>
      </header>

      {/* WARNING BANNER */}
      <AnimatePresence>
        {sysState.banner && !isCritical && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-yellow-400 border-b-2 border-slate-900 text-slate-900 font-bold px-6 py-3 flex items-center gap-4 text-sm z-10"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="uppercase tracking-wide">{sysState.banner}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CRITICAL ALERT - Replaces the bubbly modal with a full-screen takeover banner */}
      <AnimatePresence>
        {hasCollapsed && !isAlarmDismissed && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-red-600 flex flex-col items-center justify-center text-white"
          >
            <div className="absolute inset-0 border-[16px] border-white animate-pulse pointer-events-none"></div>
            <AlertTriangle className="relative z-10 w-32 h-32 mb-8 text-white animate-pulse" strokeWidth={1.5} />
            <h2 className="relative z-10 text-6xl font-black mb-4 tracking-tighter uppercase text-white">Evacuate Area</h2>
            <h3 className="relative z-10 text-2xl font-bold mb-12 uppercase tracking-widest">Tertiary Creep / Strata Failure Imminent</h3>
            
            <div className="relative z-10 bg-black/20 border-2 border-white/30 p-6 mb-12 max-w-2xl text-left font-mono">
              <p className="text-white text-base leading-relaxed">
                <span className="font-bold">[AI_PREDICTION_LOG]:</span> Hyperbolic acceleration d²θ/dt² exceeded safety threshold. High probability of surface breakthrough within 72-120 hours. 
              </p>
            </div>
            
            <button 
              onClick={() => setIsAlarmDismissed(true)} 
              className="relative z-10 px-8 py-4 bg-slate-100 text-red-700 hover:bg-slate-200 transition-colors font-bold uppercase tracking-widest text-sm border-2 border-slate-900 cursor-pointer shadow-[8px_8px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-2 active:translate-y-2"
            >
              Acknowledge Warning
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN GRID LAYOUT - Flat, border-separated */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* MAIN DASHBOARD AREA */}
        <main className={`flex-1 flex flex-col transition-all duration-300 border-r-2 border-slate-900`}>
          
          {/* Top Row: AI Risk & Map */}
          <div className="flex-[2] flex border-b-2 border-slate-900">
            {/* Left Column: AI Risk Engine */}
            <div className="w-1/3 border-r-2 border-slate-900 flex flex-col bg-slate-100 p-6">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6 flex justify-between items-center">
                AI Risk Engine
                <span className="text-[10px] bg-slate-900 text-white px-2 py-1">LIVE</span>
              </h2>
              
              <div className="flex-1 flex flex-col items-center justify-center w-full px-8">
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-6xl font-black tracking-tighter ${sysState.color}`}>{anomalyScore}</span>
                  <span className="text-2xl font-bold text-slate-400">/100</span>
                </div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">Anomaly Score</div>
                
                <div className={`px-4 py-2 border-2 border-slate-900 shadow-[4px_4px_0px_rgba(15,23,42,1)] font-bold tracking-widest text-sm ${sysState.color}`}>
                  {sysState.text}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t-2 border-slate-900">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Live Telemetry Feed</div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 uppercase">Focus Node</span>
                    <span className="text-slate-900 font-bold">{selectedNode.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 uppercase">Accel d²θ/dt²</span>
                    <span className="text-slate-900 font-bold">{displayData?.nodes[selectedNode]?.acceleration || 0} °/s²</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setActivePanel(activePanel === 'ahsm' ? null : 'ahsm')}
                className="w-full mt-6 py-3 bg-sky-300 text-slate-900 font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 border-2 border-slate-900 shadow-[4px_4px_0px_rgba(15,23,42,1)] hover:shadow-none hover:translate-y-1 hover:translate-x-1"
              >
                Launch Planner <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Map Area */}
            <div className="w-2/3 relative flex flex-col bg-slate-200">
              <div className="absolute top-4 left-4 z-[400] flex gap-2">
                <div className="bg-slate-100 border-2 border-slate-900 px-3 py-1 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(15,23,42,1)] text-slate-900">
                  Live Deployment Map
                </div>
                <button 
                  onClick={() => setShowDinsar(!showDinsar)}
                  className={`border-2 border-slate-900 px-3 py-1 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(15,23,42,1)] transition-colors flex items-center gap-2 cursor-pointer ${showDinsar ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                >
                  <Layers className="w-3 h-3" /> D-InSAR Heatmap
                </button>
              </div>

              <div className="flex-1 w-full h-full">
                <MapContainer center={CENTER} zoom={17} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles &copy; Esri"
                  />
                  
                  {/* D-InSAR Satellite Heatmap Overlay - Realistic Image */}
                  {showDinsar && (
                    <ImageOverlay
                      url="/heatmap.png"
                      bounds={[[23.736, 86.411], [23.750, 86.427]]}
                      opacity={0.4}
                      className="mix-blend-multiply blur-[12px]"
                    />
                  )}

                  {/* AHSM Planning Overlays */}
                  {isGridGenerated && (
                    <>
                      <Polygon 
                        positions={riskZonePolygon} 
                        pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.15, dashArray: '5, 10', weight: 2 }} 
                      />
                      {suggestedPlacements.map((pos, i) => (
                        <Circle 
                          key={`sugg_${i}`} 
                          center={pos} 
                          radius={12} 
                          pathOptions={{ color: '#0f172a', fillColor: '#f8fafc', fillOpacity: 0.8, weight: 2 }}
                        />
                      ))}
                    </>
                  )}
                  {nodes.map(node => (
                    <CircleMarker
                      key={node.id}
                      center={node.pos}
                      radius={isCritical ? 14 : 10}
                      eventHandlers={{ click: () => setSelectedNode(node.id) }}
                      pathOptions={{
                        color: '#0f172a',
                        fillColor: selectedNode === node.id ? '#7dd3fc' : (isCritical ? '#ef4444' : '#ffffff'),
                        fillOpacity: 1,
                        weight: 2,
                        className: isCritical ? 'animate-ping' : ''
                      }}
                    >
                      <Popup className="font-sans font-bold text-slate-900 border-2 border-slate-900 rounded-none shadow-[4px_4px_0px_rgba(15,23,42,1)]">
                        <div className="text-sm">{node.id.toUpperCase()}</div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* Bottom Row: Telemetry Charts (3 Columns) */}
          <div className="flex flex-1 min-h-[250px]">
            {/* Vibration Chart */}
            <div className="w-1/3 border-r-2 border-slate-900 p-4 flex flex-col bg-slate-100">
              <div className="flex justify-between items-end mb-4 border-b-2 border-slate-900 pb-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Vibration (PPV mm/s)</h2>
                </div>
                <select 
                  value={selectedNode} 
                  onChange={(e) => setSelectedNode(e.target.value)}
                  className="bg-transparent text-slate-900 text-xs font-bold uppercase tracking-widest outline-none cursor-pointer"
                >
                  {nodes.map(n => <option key={n.id} value={n.id}>{n.id.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#cbd5e1" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" tick={{fontSize: 10, fontFamily: 'Space Grotesk'}} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{fontSize: 10, fontFamily: 'Space Grotesk'}} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '0', boxShadow: '4px 4px 0px rgba(15,23,42,1)'}} 
                      itemStyle={{color: '#fff', fontWeight: 'bold'}}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <ReferenceLine y={vibThreshold} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `AI Limit (${extractionMethod})`, fill: '#f59e0b', fontSize: 10, position: 'insideTopLeft' }} />
                    <ReferenceLine y={-vibThreshold} stroke="#f59e0b" strokeDasharray="5 5" />
                    <Line type="linear" dataKey="vib" stroke="#0f172a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Tilt Chart */}
            <div className="w-1/3 border-r-2 border-slate-900 p-4 flex flex-col bg-slate-100">
              <div className="flex justify-between items-end mb-4 border-b-2 border-slate-900 pb-2">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Displacement (θ)</h2>
                <div className="text-xs font-bold text-slate-500 uppercase">{selectedNode.toUpperCase()}</div>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#cbd5e1" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" tick={{fontSize: 10, fontFamily: 'Space Grotesk'}} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{fontSize: 10, fontFamily: 'Space Grotesk'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '0', boxShadow: '4px 4px 0px rgba(15,23,42,1)'}} 
                      itemStyle={{color: '#7dd3fc', fontWeight: 'bold'}}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <ReferenceLine y={tiltThreshold} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `Failure Threshold`, fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }} />
                    <Line type="monotone" dataKey="tilt" stroke="#7dd3fc" strokeWidth={3} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tilt Acceleration (Secondary Derivative) Chart */}
            <div className="w-1/3 p-4 flex flex-col bg-slate-100">
              <div className="flex justify-between items-end mb-4 border-b-2 border-slate-900 pb-2">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Acceleration (d²θ/dt²)</h2>
                <div className="text-xs font-bold text-slate-500 uppercase">{selectedNode.toUpperCase()}</div>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#cbd5e1" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" tick={{fontSize: 10, fontFamily: 'Space Grotesk'}} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{fontSize: 10, fontFamily: 'Space Grotesk'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '0', boxShadow: '4px 4px 0px rgba(15,23,42,1)'}} 
                      itemStyle={{color: '#ef4444', fontWeight: 'bold'}}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="accel" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </main>

        {/* SLIDING SIDE PANEL */}
        <AnimatePresence>
          {activePanel && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 450, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="bg-slate-100 flex flex-col overflow-hidden border-l-2 border-slate-900"
            >
              <div className="w-[450px] h-full flex flex-col overflow-y-auto custom-scrollbar">
                
                {/* FLEET STATUS PANEL */}
                {activePanel === 'fleet' && (
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-8 border-b-2 border-slate-900 pb-4">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Fleet Status</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Node Diagnostics</p>
                      </div>
                      <button onClick={() => setActivePanel(null)} className="p-2 border-2 border-transparent hover:border-slate-900 transition-colors cursor-pointer">
                        <X className="w-5 h-5 text-slate-900" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      {nodes.map(node => {
                        const nData = displayData?.nodes[node.id];
                        const isNodeSelected = selectedNode === node.id;
                        return (
                          <div 
                            key={node.id} 
                            onClick={() => setSelectedNode(node.id)}
                            className={`p-4 border-2 transition-all cursor-pointer ${isNodeSelected ? 'border-slate-900 bg-sky-100 shadow-[4px_4px_0px_rgba(15,23,42,1)] translate-x-[-2px] translate-y-[-2px]' : 'border-slate-300 bg-white hover:border-slate-900 hover:shadow-[4px_4px_0px_rgba(15,23,42,1)] hover:translate-x-[-2px] hover:translate-y-[-2px]'}`}
                          >
                            <div className="flex justify-between items-center mb-3">
                              <div className="font-bold text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
                                <Cpu className="w-4 h-4" /> {node.id}
                              </div>
                              <div className="flex items-center gap-1">
                                <Signal className="w-3 h-3 text-emerald-600" />
                                <span className="text-[10px] font-bold text-slate-500">-42dBm</span>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-4 text-xs font-mono">
                              <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-sans font-bold text-slate-500 mb-1">Battery</span>
                                <div className="flex items-center gap-2 font-bold">
                                  {nData?.charging ? <BatteryCharging className="w-4 h-4 text-amber-500" /> : <Battery className="w-4 h-4 text-slate-700" />}
                                  {nData?.battery || 0}V
                                </div>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-sans font-bold text-slate-500 mb-1">Status</span>
                                <span className="text-emerald-600 font-bold">ONLINE</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AHSM PANEL CONTENT */}
                {activePanel === 'ahsm' && (
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-8 border-b-2 border-slate-900 pb-4">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">AHSM Planner</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Sensor Distribution</p>
                      </div>
                      <button onClick={() => setActivePanel(null)} className="p-2 border-2 border-transparent hover:border-slate-900 transition-colors cursor-pointer">
                        <X className="w-5 h-5 text-slate-900" />
                      </button>
                    </div>
                    
                    <div className="mb-6 pb-6 border-b-2 border-slate-200">
                      <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Extraction Method</label>
                      <select 
                        value={extractionMethod}
                        onChange={(e) => setExtractionMethod(e.target.value)}
                        className="w-full bg-slate-100 border-2 border-slate-900 p-3 text-sm font-bold uppercase outline-none focus:bg-cyan-50 cursor-pointer"
                      >
                        <option value="Traditional Pillar">Traditional Pillar</option>
                        <option value="Wide Stall">Wide Stall (Indian Standard)</option>
                      </select>
                    </div>


                    {!isGridGenerated ? (
                      <div className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Location Target</label>
                          <input type="text" defaultValue="23.7431, 86.4190" className="w-full bg-slate-100 border-2 border-slate-900 p-3 font-mono text-sm outline-none focus:bg-cyan-50" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Overburden Type (Angle of Draw)</label>
                          <select 
                            value={drawAngleStr}
                            onChange={(e) => setDrawAngleStr(e.target.value)}
                            className="w-full bg-slate-100 border-2 border-slate-900 p-3 text-sm font-bold uppercase outline-none focus:bg-cyan-50 cursor-pointer"
                          >
                            <option value="22">Hard Sandstone (22°)</option>
                            <option value="45">Soft Alluvium (45°)</option>
                            <option value="35">Shale Mix (35°)</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Depth (m)</label>
                            <input 
                              type="number" 
                              value={mineDepth} 
                              onChange={(e) => setMineDepth(parseFloat(e.target.value) || 0)} 
                              className="w-full bg-slate-100 border-2 border-slate-900 p-3 font-mono text-sm outline-none focus:bg-cyan-50" 
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Seam (m)</label>
                            <input 
                              type="number" 
                              value={seamThickness} 
                              onChange={(e) => setSeamThickness(parseFloat(e.target.value) || 0)} 
                              className="w-full bg-slate-100 border-2 border-slate-900 p-3 font-mono text-sm outline-none focus:bg-cyan-50" 
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Primary Key Stratum Depth (m)</label>
                          <input 
                            type="number" 
                            value={keyStratumDepth} 
                            onChange={(e) => setKeyStratumDepth(parseFloat(e.target.value) || 0)} 
                            className="w-full bg-slate-100 border-2 border-slate-900 p-3 font-mono text-sm outline-none focus:bg-cyan-50" 
                          />
                        </div>

                        <button 
                          onClick={() => setIsGridGenerated(true)}
                          className="w-full mt-4 bg-slate-900 text-white font-bold uppercase tracking-widest py-4 border-2 border-slate-900 hover:bg-sky-300 hover:text-slate-900 hover:shadow-[4px_4px_0px_rgba(15,23,42,1)] hover:-translate-y-1 transition-all cursor-pointer"
                        >
                          Calculate Hyperbola Grid
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-slate-900 text-white p-5 border-2 border-slate-900">
                          <h3 className="font-bold uppercase tracking-widest text-sm mb-4 border-b border-white/20 pb-2">Manifest Generated</h3>
                          <div className="space-y-2 font-mono text-xs">
                            <div className="flex justify-between"><span className="text-white/60">Target</span> <span>Panel 4</span></div>
                            <div className="flex justify-between"><span className="text-white/60">Angle of Draw</span> <span>{drawAngleStr}°</span></div>
                            <div className="flex justify-between"><span className="text-white/60">Hyperbola Nodes</span> <span className="text-sky-300 font-bold">{suggestedPlacements.length}</span></div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-3">Deployment Coordinates</h4>
                          <div className="border-2 border-slate-900 bg-slate-100 p-4 h-[200px] overflow-y-auto custom-scrollbar font-mono text-xs space-y-3">
                            {suggestedPlacements.map((pos, i) => (
                              <div key={i} className="flex justify-between border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                                <span className="font-bold text-slate-500">AHSM-{(i+1).toString().padStart(2, '0')}</span>
                                <span>{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={() => setIsGridGenerated(false)}
                          className="w-full bg-slate-100 text-slate-900 font-bold uppercase tracking-widest py-3 border-2 border-slate-900 hover:bg-slate-200 transition-colors text-xs shadow-[4px_4px_0px_rgba(15,23,42,1)] cursor-pointer"
                        >
                          Modify Parameters
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
