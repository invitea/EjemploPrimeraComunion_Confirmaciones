// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCTh8kPdvu-6Z5_cckNts22VrhdUTLVspM",
  authDomain: "invitea-f7331.firebaseapp.com",
  projectId: "invitea-f7331",
  storageBucket: "invitea-f7331.firebasestorage.app",
  messagingSenderId: "145115727672",
  appId: "1:145115727672:web:d1d89c20bf946b9e2663cd",
  measurementId: "G-8JS1MDZVGQ"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variables globales
const pageSize = 10;
let currentPage = 1;
let currentDocs = []; // Almacenará todos los documentos para paginación local
let docToDelete = null, docToEdit = null;
let searchTimeout = null;

// Utilidades
function calcularDetalle(doc) {
  const adultos = Number(doc.adultos ?? doc.adults ?? 0);
  const ninos = Number(doc.ninos ?? doc.children ?? 0);
  return { adultos, ninos, total: adultos + ninos };
}

function formatFechaHora(timestamp) {
  if (!timestamp) return '—';
  try {
    const d = (timestamp.toDate) ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleString('es-MX', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch(e) { 
    return '—'; 
  }
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { 
    t.classList.remove('show'); 
    setTimeout(() => t.remove(), 300); 
  }, 3000);
}

function showLoading() { 
  document.getElementById('loadingOverlay').classList.add('active'); 
}

function hideLoading() { 
  document.getElementById('loadingOverlay').classList.remove('active'); 
}

// RENDERIZADO (Solo renderiza el array que se le pasa)
function renderPage(docs) {
  const listEl = document.getElementById('confirmacionesList');
  const loadingEl = document.getElementById('loading');
  listEl.innerHTML = '';
  loadingEl.style.display = 'none';

  if (!docs.length) {
    listEl.innerHTML = `<div class="empty-state">No se encontraron registros.</div>`;
    return;
  }

  docs.forEach(docSnap => {
    const d = docSnap.data();
    const det = calcularDetalle(d);
    const isConfirmed = det.total > 0;
    const initials = (d.nombre || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    
    const iconEdit = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    const iconTrash = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    const row = document.createElement('div');
    row.className = `list-item ${isConfirmed ? 'confirmed' : ''}`;
    
    row.innerHTML = `
      <div class="col-avatar">
        <div class="avatar-circle">${initials}</div>
      </div>
      <div class="col-info">
        <div class="name">${d.nombre || 'Sin nombre'}</div>
        <div class="meta">
          ${d.email ? `<span style="opacity:0.8">${d.email}</span>` : ''}
          ${d.email && d.telefono ? ' • ' : ''}
          ${d.telefono ? `<span>${d.telefono}</span>` : ''}
        </div>
      </div>
      <div class="col-guests">
        <div class="badge-pill">Adultos: <strong>${det.adultos}</strong></div>
        <div class="badge-pill" style="margin-left:4px">Niños: <strong>${det.ninos}</strong></div>
      </div>
      <div class="col-date">${formatFechaHora(d.timestamp)}</div>
      <div class="col-actions">
        <button class="btn-ghost btn-edit" title="Editar">${iconEdit}</button>
        <button class="btn-ghost btn-delete" style="color:var(--danger-text)" title="Eliminar">${iconTrash}</button>
      </div>
    `;

    row.querySelector('.btn-edit').addEventListener('click', () => openEditModal(docSnap.id, d));
    row.querySelector('.btn-delete').addEventListener('click', () => openDeleteModal(docSnap.id));

    listEl.appendChild(row);
  });
}

// Lógica de Paginación Local y Renderizado
function getEffectiveDocs() {
  const searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
  let docsToUse = currentDocs;

  // Aplicar filtro si hay una búsqueda activa
  if (searchQuery) {
    docsToUse = currentDocs.filter(doc => {
      const d = doc.data();
      return (d.nombre || '').toLowerCase().includes(searchQuery) || 
             (d.email || '').toLowerCase().includes(searchQuery);
    });
  }
  
  // TODO: Implementar filtro por estado (confirmed/pending) si fuera necesario.
  return docsToUse;
}

function renderCurrentPage() {
  const docsArray = getEffectiveDocs();

  if (docsArray.length === 0) {
    document.getElementById('confirmacionesList').innerHTML = `<div class="empty-state">No se encontraron registros.</div>`;
    updateStats([]);
    return;
  }

  // Calcular el rango de documentos a mostrar
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  
  const pageDocs = docsArray.slice(startIndex, endIndex);

  // Renderizar solo la página actual
  renderPage(pageDocs); 
  
  // Actualizar estadísticas con TODOS los documentos no paginados (para los totales)
  updateStats(currentDocs.map(d => d.data()));

  // Actualizar controles de paginación
  document.getElementById('pageNumber').textContent = currentPage;
  document.getElementById('prevPage').disabled = currentPage === 1;
  document.getElementById('nextPage').disabled = endIndex >= docsArray.length;
}

function loadNextPage() {
  const effectiveDocs = getEffectiveDocs();
  if (currentPage * pageSize < effectiveDocs.length) {
    currentPage++;
    renderCurrentPage();
  }
}

function loadPrevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderCurrentPage();
  }
}

// REALTIME LISTENER (Se mantiene activo para las actualizaciones)
function startRealtimeListener() {
  showLoading();
  
  // Creamos la query base para escuchar toda la colección (ordenada)
  const query = db.collection('ejemploprimeracomunion_panel').orderBy('timestamp', 'desc');

  // Configura el listener en tiempo real (onSnapshot)
  return query.onSnapshot(snapshot => {
    // 1. Conexión Status
    document.getElementById('connectionDot').classList.remove('offline');
    document.getElementById('realtimeStatus').textContent = 'En línea (Realtime)';
    
    // 2. Almacenamos todos los documentos
    currentDocs = snapshot.docs;
    
    // 3. Reiniciamos la paginación a la página 1 después de cualquier cambio global
    currentPage = 1;
    
    // 4. Renderizamos (aplicará búsqueda y paginación local)
    renderCurrentPage(); 
    
    // 5. Ocultamos el loader solo después de la primera carga completa
    hideLoading();

  }, error => {
    // Manejo de errores de conexión/permisos
    console.error("Error en la conexión Realtime:", error);
    document.getElementById('connectionDot').classList.add('offline');
    document.getElementById('realtimeStatus').textContent = 'Error de conexión';
    hideLoading();
    showToast('Error en la conexión Realtime. Datos estáticos.', 'error');
  });
}

// ESTADÍSTICAS (Usa todos los datos)
function updateStats(items) {
  let totalP = 0, totalA = 0, totalN = 0; 
  let confirmedCount = 0;
  let latest = null;
  
  items.forEach(d => {
    const det = calcularDetalle(d);
    if (det.total > 0) {
      confirmedCount++;
    }
    totalP += det.total;
    totalA += det.adultos;
    totalN += det.ninos; 
    if (d.timestamp && d.timestamp.toDate) {
      const t = d.timestamp.toDate();
      if (!latest || t > latest) latest = t;
    }
  });
  
  document.getElementById('totalConfirmaciones').textContent = confirmedCount; 
  document.getElementById('totalPersonas').textContent = totalP;
  document.getElementById('totalAdultos').textContent = totalA;
  document.getElementById('totalNinos').textContent = totalN; 
  
  if(latest) {
    document.getElementById('lastUpdate').textContent = 'Act: ' + latest.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
  }
}

// MODALES Y SEARCH
function openDeleteModal(id) {
  docToDelete = id; 
  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active'); 
  docToDelete = null;
}

function openEditModal(id, data) {
  docToEdit = id;
  const det = calcularDetalle(data);
  document.getElementById('editNombre').value = data.nombre || '';
  document.getElementById('editEmail').value = data.email || '';
  document.getElementById('editTelefono').value = data.telefono || '';
  document.getElementById('editAdultos').value = det.adultos;
  document.getElementById('editNinos').value = det.ninos;
  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active'); 
  docToEdit = null;
}

function searchLocal(q) {
  const clearBtn = document.getElementById('clearSearchBtn');
  clearBtn.style.display = q ? 'block' : 'none';
  
  // Reset a la página 1 para el resultado de la búsqueda
  currentPage = 1;
  
  // Renderiza el array efectivo (que aplicará la búsqueda)
  renderCurrentPage(); 
}

async function exportCSV() {
  showLoading();
  try {
    // Para exportar, aún se requiere una llamada de "get()" para asegurar la colección completa
    const snap = await db.collection('ejemploprimeracomunion_panel').orderBy('timestamp', 'desc').get();
    const rows = snap.docs.map(d => {
      const data = d.data(); 
      const det = calcularDetalle(data);
      const clean = t => `"${(t||'').replace(/"/g,'""')}"`;
      return [clean(data.nombre), clean(data.email), det.adultos, det.ninos, clean(formatFechaHora(data.timestamp))].join(',');
    });
    const csv = ["Nombre,Email,Adultos,Ninos,Fecha"].join(',') + '\n' + rows.join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = 'invitados.csv'; 
    a.click();
    showToast('CSV descargado');
  } catch(e) { 
    showToast('Error exportando', 'error'); 
  } finally { 
    hideLoading(); 
    document.getElementById('exportModal').classList.remove('active'); 
  }
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('year').textContent = new Date().getFullYear();
  
  // Configurar conexión de red
  db.enableNetwork().catch(()=>{});
  
  // Paginación
  document.getElementById('nextPage').addEventListener('click', loadNextPage);
  document.getElementById('prevPage').addEventListener('click', loadPrevPage);
  document.getElementById('refreshBtn').addEventListener('click', renderCurrentPage); 
  
  // Búsqueda
  document.getElementById('searchInput').addEventListener('input', (e) => {
    if(searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchLocal(e.target.value.trim()), 300);
  });
  
  document.getElementById('clearSearchBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = ''; 
    searchLocal('');
  });

  // Modal de eliminación
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if(docToDelete) {
      await db.collection('ejemploprimeracomunion_panel').doc(docToDelete).delete();
      showToast('Registro eliminado'); 
      closeDeleteModal(); 
    }
  });
  
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);

  // Modal de edición
  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(docToEdit) {
      await db.collection('ejemploprimeracomunion_panel').doc(docToEdit).update({
        nombre: document.getElementById('editNombre').value,
        email: document.getElementById('editEmail').value,
        telefono: document.getElementById('editTelefono').value,
        adultos: parseInt(document.getElementById('editAdultos').value)||0,
        ninos: parseInt(document.getElementById('editNinos').value)||0
      });
      showToast('Registro actualizado'); 
      closeEditModal(); 
    }
  });
  
  document.getElementById('closeEditModalBtn').addEventListener('click', closeEditModal);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  
  // Modal de exportación
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    document.getElementById('exportModal').classList.add('active');
  });
  
  document.getElementById('confirmExportBtn').addEventListener('click', exportCSV);
  document.getElementById('cancelExportBtn').addEventListener('click', () => {
    document.getElementById('exportModal').classList.remove('active');
  });

  // Cerrar modales al hacer clic fuera
  window.onclick = e => { 
    if(e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active'); 
    }
  };
}

// Inicializar aplicación
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  
  // Iniciar el listener de tiempo real
  startRealtimeListener();
});
