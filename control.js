/* ============================================
   control.js — Control Carrito (POST + WSS)
   Opción B: Repetir usa pasos locales (localStorage)
   - Guardar: /secuencia/demo/agregar (encabezado) + persistir pasos localmente
   - Ejecutar grabada: /secuencia/ejecutar_orquestada con recordedSequence
   - Repetir: /secuencia/ejecutar_orquestada con pasos locales (seq_steps_<ID>)
   ============================================ */

// ----------------- Config -----------------
const API_URL = 'https://silencesuzuka.duckdns.org/api';
const WS_URL  = 'wss://silencesuzuka.duckdns.org/ws';
const DISPOSITIVO_ID = 1;

// Velocidades
const SPEED = { lento: 150, medio: 190, alto: 220 };
let selectedSpeed = SPEED.lento;

// ----------------- Estado UI -----------------
const statusMovimiento = document.getElementById('status-movimiento');
const statusObstaculo  = document.getElementById('status-obstaculo');
const statusSecuencia  = document.getElementById('status-secuencia');
const statusEvasion    = document.getElementById('status-evasion');

const btnGrabar           = document.getElementById('btn-grabar');
const btnGuardar          = document.getElementById('btn-guardar');
const btnEjecutarGrabada  = document.getElementById('btn-ejecutar-grabada');
const btnRepetir          = document.getElementById('btn-repetir');
const selectSecuencia     = document.getElementById('select-secuencia');
const nombreSecuencia     = document.getElementById('nombre-secuencia');

const recordingInfo    = document.getElementById('recording-info');
const pasoCount        = document.getElementById('paso-count');
const overlayGrabacion = document.getElementById('overlay-grabacion');
const overlayCount     = document.getElementById('overlay-count');
const overlayMovs      = document.getElementById('overlay-movimientos');

// Botones velocidad (chips)
const speed150 = document.getElementById('btn-speed-150');
const speed190 = document.getElementById('btn-speed-190');
const speed220 = document.getElementById('btn-speed-220');

// ----------------- Estado lógico -----------------
let websocket       = null;
let reconnectTimer  = null;

let isRecording         = false;
let recordedSequence    = []; // [{operacion, velocidad}]
let ejecutandoSecuencia = false;

const operaciones = {
  1:'Adelante',2:'Atrás',3:'Detener',
  4:'Vuelta adelante derecha',5:'Vuelta adelante izquierda',
  6:'Vuelta atrás derecha',7:'Vuelta atrás izquierda',
  8:'Giro 90° derecha',9:'Giro 90° izquierda',
  10:'Giro 360° derecha',11:'Giro 360° izquierda'
};

// ----------------- Utilidades -----------------
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function setSpeedActive(btn){
  [speed150, speed190, speed220].forEach(b => b && b.classList.remove('active'));
  if(btn) btn.classList.add('active');
}

function setEstadoMovimiento(txt){ if(statusMovimiento) statusMovimiento.textContent = txt; }
function setEstadoSecuencia(txt){ if(statusSecuencia) statusSecuencia.textContent = txt; }
function setEstadoObstaculo(txt){ if(statusObstaculo) statusObstaculo.textContent = txt; }
function setEstadoEvasion(txt){ if(statusEvasion) statusEvasion.textContent = txt; }

// Guardar/leer pasos locales de una secuencia por ID
function saveLocalSteps(idSec, pasos){
  try { localStorage.setItem(`seq_steps_${idSec}`, JSON.stringify(pasos || [])); } catch(_){}
}
function loadLocalSteps(idSec){
  try {
    const s = localStorage.getItem(`seq_steps_${idSec}`);
    return s ? JSON.parse(s) : [];
  } catch(_){ return []; }
}

// ----------------- WebSocket -----------------
function connectWebSocket(){
  if(websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) return;

  websocket = new WebSocket(WS_URL);

  websocket.addEventListener('open', () => {
    clearTimeout(reconnectTimer);
    websocket.send(JSON.stringify({ type:'identify', dispositivo: DISPOSITIVO_ID }));
    setEstadoMovimiento('Conectado al servidor WebSocket');
  });

  websocket.addEventListener('close', () => {
    setEstadoMovimiento('Reconectando WebSocket...');
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  });

  websocket.addEventListener('message', evt => {
    try{
      const msg = JSON.parse(evt.data || '{}');
      if(msg.type !== 'event') return;
      const ev = msg.event;
      const d  = msg.data || {};
      if(ev === 'secuencia_iniciada'){
        setEstadoSecuencia(`Secuencia iniciada (ejec #${d.id_ejecucion ?? '-'})`);
      } else if(ev === 'comando_carrito'){
        setEstadoMovimiento(`Paso: ${operaciones[d.operacion] || d.operacion} | Vel: ${d.velocidad ?? '-'}`);
      } else if(ev === 'secuencia_finalizada'){
        setEstadoSecuencia(`Secuencia finalizada (ejec #${d.id_ejecucion ?? '-'})`);
        ejecutandoSecuencia = false;
      } else if(ev === 'obstaculo_detectado'){
        setEstadoObstaculo(`⚠️ Obstáculo: ${d.obstaculo ?? '-'}`);
      }
    }catch(_){}
  });
}

// ----------------- API Calls (POST) -----------------
async function postJSON(url, body){
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if(!res.ok) throw data;
  return data;
}

async function enviarMovimiento(idOperacion){
  if(idOperacion == null) return;
  try{
    await postJSON(`${API_URL}/movimiento/registrar`, {
      id_dispositivo: DISPOSITIVO_ID,
      id_operacion: idOperacion,
      velocidad: selectedSpeed
    });

    if(isRecording){
      recordedSequence.push({ operacion: idOperacion, velocidad: selectedSpeed });
      if(pasoCount) pasoCount.textContent = recordedSequence.length;
      if(overlayCount) overlayCount.textContent = `${recordedSequence.length} pasos`;
      if(overlayMovs){
        if(recordedSequence.length === 1) overlayMovs.innerHTML = '';
        const item = document.createElement('div');
        item.className = 'movimiento-item';
        item.innerHTML = `
          <span class="paso-numero">${recordedSequence.length}</span>
          <span class="operacion-nombre">${operaciones[idOperacion] || idOperacion}</span>
          <span class="tiempo-ms">${selectedSpeed}</span>
        `;
        overlayMovs.appendChild(item);
        overlayMovs.scrollTop = overlayMovs.scrollHeight;
      }
    }else{
      setEstadoMovimiento(`Movimiento: ${operaciones[idOperacion] || idOperacion} (Vel ${selectedSpeed})`);
    }
  }catch(_){
    alert('Error al comunicarse con el servidor');
  }
}

// ----------------- Controles Manuales -----------------
document.querySelectorAll('.control-btn').forEach(btn => {
  let pressed = false;

  btn.addEventListener('mousedown', () => {
    if(ejecutandoSecuencia || pressed) return;
    pressed = true;
    const operacion = parseInt(btn.dataset.op, 10);
    enviarMovimiento(operacion);
    btn.style.opacity = '0.85';
    btn.style.transform = 'scale(0.97)';
  });

  const reset = () => {
    if(!pressed) return;
    pressed = false;
    enviarMovimiento(3); // detener
    setEstadoMovimiento('Detenido');
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  };

  btn.addEventListener('mouseup', reset);
  btn.addEventListener('mouseleave', reset);
});

// ----------------- Velocidad (chips) -----------------
if(speed150){ speed150.addEventListener('click', () => { selectedSpeed = SPEED.lento; setSpeedActive(speed150); }); }
if(speed190){ speed190.addEventListener('click', () => { selectedSpeed = SPEED.medio; setSpeedActive(speed190); }); }
if(speed220){ speed220.addEventListener('click', () => { selectedSpeed = SPEED.alto;  setSpeedActive(speed220); }); }

// ----------------- Grabación -----------------
btnGrabar?.addEventListener('click', () => {
  if(!isRecording){
    isRecording = true;
    recordedSequence = [];
    btnGrabar.textContent = '⏹️ Detener Grabación';
    btnGrabar.classList.remove('btn-danger');
    btnGrabar.classList.add('btn-secondary');
    btnGuardar.disabled = true;
    btnEjecutarGrabada.disabled = true;
    if(recordingInfo) recordingInfo.style.display = 'block';
    if(pasoCount) pasoCount.textContent = '0';
    if(overlayGrabacion) overlayGrabacion.style.display = 'block';
    if(overlayCount) overlayCount.textContent = '0 pasos';
    if(overlayMovs) overlayMovs.innerHTML = '<p class="text-muted small mb-0">Presiona botones para grabar...</p>';
    setEstadoMovimiento('🔴 Grabando...');
  }else{
    isRecording = false;
    btnGrabar.textContent = '🔴 Grabar';
    btnGrabar.classList.remove('btn-secondary');
    btnGrabar.classList.add('btn-danger');
    btnGuardar.disabled = recordedSequence.length === 0;
    btnEjecutarGrabada.disabled = true;
    if(recordingInfo) recordingInfo.style.display = 'none';
    setEstadoMovimiento(`Secuencia lista (${recordedSequence.length} pasos). Guárdala.`);
  }
});

// Guardar encabezado + pasos locales (Opción B)
btnGuardar?.addEventListener('click', async () => {
  const nombre = (nombreSecuencia?.value || '').trim();
  if(!nombre){ alert('Escribe un nombre para la secuencia'); return; }
  if(recordedSequence.length === 0){ alert('No hay movimientos grabados'); return; }

  const velDefault = recordedSequence[0]?.velocidad ?? SPEED.lento;

  try{
    const data = await postJSON(`${API_URL}/secuencia/demo/agregar`, {
      id_dispositivo: DISPOSITIVO_ID,
      nombre: nombre,
      velocidad: velDefault
    });
    const idSec = data?.[0]?.id_secuencia ?? data?.[0]?.ID_SECUENCIA;
    if(!idSec){ alert('No se pudo recuperar el ID de la secuencia'); return; }

    // persiste pasos locales asociados al ID
    saveLocalSteps(idSec, recordedSequence);

    alert(`✅ Secuencia "${nombre}" guardada (ID ${idSec})`);
    nombreSecuencia.value = '';
    btnGuardar.disabled = true;
    btnEjecutarGrabada.disabled = false;
    if(overlayGrabacion) overlayGrabacion.style.display = 'none';
    await cargarSecuencias();
  }catch(_){
    alert('Error al guardar la secuencia');
  }
});

// Ejecutar la secuencia recién grabada (recordedSequence en memoria)
btnEjecutarGrabada?.addEventListener('click', async () => {
  if(recordedSequence.length === 0){ alert('Primero graba y guarda una secuencia'); return; }
  try{
    ejecutandoSecuencia = true;
    setEstadoSecuencia('Ejecutando secuencia grabada...');
    await postJSON(`${API_URL}/secuencia/ejecutar_orquestada`, {
      id_dispositivo: DISPOSITIVO_ID,
      id_secuencia: 0,
      pasos: recordedSequence
    });
  }catch(_){
    ejecutandoSecuencia = false;
    alert('Error al ejecutar la secuencia grabada');
  }
});

// ----------------- Repetir (Opción B: usa pasos locales) -----------------
async function cargarSecuencias(){
  try{
    const res = await fetch(`${API_URL}/secuencia/demo/ultimas20/${DISPOSITIVO_ID}`);
    const data = await res.json();
    if(!selectSecuencia) return;
    selectSecuencia.innerHTML = '<option value="">Seleccionar secuencia...</option>';
    (data || []).forEach(s => {
      const id  = s.id_secuencia ?? s.ID_SECUENCIA ?? s.id;
      const nom = s.nombre ?? s.NOMBRE ?? 'Secuencia';
      const fec = s.creado_en ?? s.CREADO_EN ?? '';
      const op  = document.createElement('option');
      op.value = id;
      op.textContent = `${nom} (${fec ? new Date(fec).toLocaleString() : ''})`;
      selectSecuencia.appendChild(op);
    });
  }catch(_){}
}

btnRepetir?.addEventListener('click', async () => {
  const idSec = parseInt(selectSecuencia?.value || '0',10);
  if(!idSec){ alert('Selecciona una secuencia'); return; }

  const pasosLocales = loadLocalSteps(idSec);
  if(!pasosLocales || pasosLocales.length === 0){
    alert('Esta secuencia no tiene pasos almacenados localmente. Vuelve a grabarla y guardarla desde este navegador.');
    return;
  }

  try{
    ejecutandoSecuencia = true;
    setEstadoSecuencia(`Repitiendo secuencia #${idSec}...`);
    await postJSON(`${API_URL}/secuencia/ejecutar_orquestada`, {
      id_dispositivo: DISPOSITIVO_ID,
      id_secuencia: idSec,
      pasos: pasosLocales
    });
  }catch(_){
    ejecutandoSecuencia = false;
    alert('Error al repetir la secuencia');
  }
});

// ----------------- Init -----------------
document.addEventListener('DOMContentLoaded', () => {
  setSpeedActive(speed150);               // Lento por defecto
  selectedSpeed = SPEED.lento;

  connectWebSocket();
  cargarSecuencias();
});
