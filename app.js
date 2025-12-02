// --- Variables de configuración de Firebase (Usa las variables globales de Canvas) ---
// __firebase_config, __app_id, __initial_auth_token son inyectadas en el entorno.
const firebaseConfig = typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Nombre de la colección en Firestore para esta aplicación
// Se usa la estructura recomendada para datos públicos
const COLLECTION_PATH = `artifacts/${appId}/public/data/rsvps`;
let db = null;
let auth = null;
let isFirebaseReady = false;

// --- Funciones de Utilidad ---

// Calcula la fecha dinámica (mañana a partir de hoy)
function getDynamicDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateString = tomorrow.toLocaleDateString('es-MX', options);
    // Capitaliza la primera letra
    return dateString.charAt(0).toUpperCase() + dateString.slice(1);
}

// Inicializa Firebase y autentica al usuario
async function initializeFirebase() {
    if (isFirebaseReady) return;

    // Importaciones modulares de Firebase
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
    const { getAuth, signInWithCustomToken, signInAnonymously } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
    const { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Autenticación: usa el token si está disponible, sino, anónima
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
        
        isFirebaseReady = true;
        console.log("Firebase inicializado y usuario autenticado.");
    } catch (e) {
        console.error("Error al inicializar o autenticar Firebase:", e);
    }
}

// --- Lógica del Modal RSVP ---

// Elementos del DOM
const openBtn = document.getElementById('openRsvp');
const modal = document.getElementById('rsvpModal');
const closeBtn = document.getElementById('closeModalBtn');
const form = document.getElementById('rsvpForm');
const submitBtn = document.getElementById('submitBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const thankYou = document.getElementById('thankYouMessage');

const nameIn = document.getElementById('name');
const emailIn = document.getElementById('email');
const phoneIn = document.getElementById('phone');
const adultsIn = document.getElementById('adults');
const childrenIn = document.getElementById('children');

const nameErr = document.getElementById('nameError');
const emailErr = document.getElementById('emailError');
const emailDupErr = document.getElementById('emailDuplicateError');
const phoneErr = document.getElementById('phoneError');
const adErr = document.getElementById('adultsError');
const chErr = document.getElementById('childrenError');

// Validaciones
function isValidEmail(e) { if(!e) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isValidPhone(p) { if(!p) return true; return p.replace(/\D/g, '').length === 10; }
function formatPhone(v) {
    const n = v.replace(/\D/g, '');
    if (n.length <= 2) return n;
    if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`;
    return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6,10)}`;
}

// Revisa si el email ya existe en Firestore
async function checkEmail(e) {
    if (!db || !e || !isValidEmail(e)) return false;
    try {
        const rsvpCollection = collection(db, COLLECTION_PATH);
        const q = query(rsvpCollection, where('email', '==', e.toLowerCase().trim()));
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } catch (error) {
        console.error("Error al verificar email en Firestore:", error);
        return false;
    }
}

// Manejo de errores en el UI
function showErr(inputElement, errorElement, message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    inputElement.classList.add('error');
}
function clearErr(inputElement, errorElement) {
    errorElement.style.display = 'none';
    inputElement.classList.remove('error', 'warning');
}

// Event Listeners para validación en tiempo real y formato
function setupInputListeners() {
    phoneIn.addEventListener('input', (e) => {
        e.target.value = formatPhone(e.target.value);
        if(e.target.value && !isValidPhone(e.target.value)) showErr(phoneIn, phoneErr, '10 dígitos requeridos');
        else clearErr(phoneIn, phoneErr);
    });

    emailIn.addEventListener('blur', async (e) => {
        clearErr(emailIn, emailErr);
        emailDupErr.style.display = 'none';

        const val = e.target.value.trim();
        if(!val) return;

        if(!isValidEmail(val)) {
            showErr(emailIn, emailErr, 'Email inválido');
            return;
        }

        if (isFirebaseReady) {
            const exists = await checkEmail(val);
            if(exists) {
                emailDupErr.style.display = 'block';
                emailIn.classList.add('warning');
            }
        }
    });

    // Limpiar errores al escribir
    [nameIn, adultsIn, childrenIn].forEach(i => i.addEventListener('input', () => clearErr(i, document.getElementById(`${i.id}Error`))));
}

// Funciones del Modal
function openModal() {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => nameIn.focus(), 100);
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // Resetea el formulario y el estado del modal después de la transición
    setTimeout(() => {
        thankYou.style.display = 'none';
        form.style.display = 'block';
        form.reset();
        adultsIn.value = 1; childrenIn.value = 0;
        
        // Limpia todos los mensajes y clases de error
        [nameErr, emailErr, emailDupErr, phoneErr, adErr, chErr].forEach(e => e.style.display = 'none');
        [nameIn, emailIn, phoneIn, adultsIn, childrenIn].forEach(i => i.classList.remove('error', 'warning'));
        
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Confirmación';
        loadingSpinner.style.display = 'none';
    }, 300);
}

// Manejador de Envío del Formulario
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isFirebaseReady) {
        // En lugar de alert, usamos console.error o un mensaje en el modal
        console.error("Error: Firebase no está inicializado o autenticado.");
        return;
    }

    // Validación Final
    let valid = true;
    
    // Limpiar errores antes de validar
    [nameIn, emailIn, phoneIn, adultsIn, childrenIn].forEach(i => clearErr(i, document.getElementById(`${i.id}Error`)));
    emailDupErr.style.display = 'none';

    if(nameIn.value.length < 3) { showErr(nameIn, nameErr, 'Nombre requerido'); valid = false; }
    
    const emVal = emailIn.value.trim();
    if(emVal && !isValidEmail(emVal)) { showErr(emailIn, emailErr, 'Email inválido'); valid = false; }
    
    const phoneVal = phoneIn.value;
    if(phoneVal && !isValidPhone(phoneVal)) { showErr(phoneIn, phoneErr, 'Teléfono inválido'); valid = false; }
    
    if(Number(adultsIn.value) < 1) { showErr(adultsIn, adErr, 'Mínimo 1 adulto'); valid = false; }
    if(Number(childrenIn.value) < 0) { showErr(childrenIn, chErr, 'No negativo'); valid = false; }

    // Revalidación de email duplicado justo antes de enviar
    if(valid && emVal) {
        const exists = await checkEmail(emVal);
        if(exists) {
            emailDupErr.style.display = 'block';
            emailIn.classList.add('warning');
            valid = false;
        }
    }

    if(!valid) return;

    // Iniciar estado de carga
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    loadingSpinner.style.display = 'block';

    // Envío a Firestore
    try {
        const rsvpCollection = collection(db, COLLECTION_PATH);

        await addDoc(rsvpCollection, {
            nombre: nameIn.value.trim(),
            email: emVal || 'No proporcionado',
            telefono: phoneVal || 'No proporcionado',
            adultos: Number(adultsIn.value),
            ninos: Number(childrenIn.value),
            dispositivo: navigator.userAgent,
            pantalla: `${window.innerWidth}x${window.innerHeight}`,
            fechaRegistro: new Date().toLocaleString('es-MX'),
            timestamp: serverTimestamp()
        });
        
        // Éxito
        form.style.display = 'none';
        thankYou.style.display = 'block';
        loadingSpinner.style.display = 'none';
        setTimeout(closeModal, 2000);

    } catch(err) {
        console.error("Error al guardar RSVP:", err);
        // Mostrar error en el modal (sustituir por un mensaje temporal en el futuro)
        // Por ahora, solo restaura el botón
        submitBtn.disabled = false;
        submitBtn.textContent = 'Error. Intenta de nuevo.';
        loadingSpinner.style.display = 'none';
        setTimeout(() => submitBtn.textContent = 'Enviar Confirmación', 2000);
    }
});


// --- Evento DOMContentLoaded para inicializar la app ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Mostrar la fecha dinámica
    const dynamicDateElement = document.getElementById('dynamicDate');
    if (dynamicDateElement) {
        dynamicDateElement.textContent = getDynamicDate();
    }
    
    // 2. Inicializar Firebase
    await initializeFirebase();
    
    // 3. Configurar Event Listeners del formulario
    setupInputListeners();
    openBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
});