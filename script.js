/**
 * 3DRIP | LUXURY STREETWEAR 2026
 * MAIN SCRIPT
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocFromServer, setDoc, getDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase
console.log('[SYSTEM] INITIALIZING FIREBASE MAINFRAME...');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
console.log('[SYSTEM] FIREBASE CORE ONLINE.');

// Connectivity Test
async function testConnection() {
    try {
        await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
        }
    }
}
testConnection();

document.addEventListener('DOMContentLoaded', () => {
    // Operation Types for error handling
    const OperationType = {
        CREATE: 'create',
        UPDATE: 'update',
        DELETE: 'delete',
        LIST: 'list',
        GET: 'get',
        WRITE: 'write',
    };

    const showToast = (msg, actionText, onAction) => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <i class="fa-solid fa-bell" style="color: var(--accent);"></i>
            <span class="toast-msg">${msg}</span>
            ${actionText ? `<button class="undo-btn">${actionText}</button>` : ''}
        `;
        
        if (onAction) {
            toast.querySelector('.undo-btn').addEventListener('click', () => {
                onAction();
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 400);
            });
        }

        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 6000); // 6s duration
    };

    function handleFirestoreError(error, operationType, path) {
        const errInfo = {
            error: error instanceof Error ? error.message : String(error),
            authInfo: {
                userId: auth.currentUser?.uid,
                email: auth.currentUser?.email,
                emailVerified: auth.currentUser?.emailVerified,
            },
            operationType,
            path
        };
        console.error('Firestore Error: ', JSON.stringify(errInfo));
        showToast(`ERROR: ${error.message || 'PERMISSION DENIED'}`);
    }

    // Current state held in memory (synced with Firestore)
    let state = {
        products: [],
        orders: [],
        logs: [],
        trash: []
    };

    // Replace DB helper with Firestore logic
    const DB = {
        // Now mostly reactive listeners, but we keep the structure for compatibility
        saveOrder: async (orderData) => {
            try {
                console.log('[ORDER_SAVE_START]', orderData);

                const docRef = await addDoc(collection(db, 'orders'), {
                    ...orderData,
                    createdAt: new Date().toISOString()
                });

                console.log('[ORDER_SAVE_SUCCESS]', docRef.id);

                return docRef.id;

            } catch (error) {
                console.error('[ORDER_SAVE_ERROR]', error);
                throw error;
            }
        },
        addProduct: async (productData) => {
            if (!productData || !productData.img || productData.img.trim() === '') {
                throw new Error('SERVER REJECTION: IMAGE SOURCE REQUIRED.');
            }
            await addDoc(collection(db, 'products'), {
                ...productData,
                createdAt: new Date().toISOString()
            });
        },
        updateProduct: async (id, productData) => {
            if (!productData || !productData.img || productData.img.trim() === '') {
                throw new Error('SERVER REJECTION: IMAGE SOURCE REQUIRED.');
            }
            await updateDoc(doc(db, 'products', id), productData);
        },
        deleteToTrash: async (product) => {
            try {
                const { id, ...productData } = product;
                // Move to trash collection first
                await addDoc(collection(db, 'trash'), {
                    ...productData,
                    deletedAt: new Date().toISOString()
                });
                // Then delete from products
                await deleteDoc(doc(db, 'products', id));
                // Log action
                await DB.addLog({
                    productName: productData.name,
                    price: productData.price,
                    type: 'DELETED',
                    status: 'DELETED'
                });
            } catch (error) {
                handleFirestoreError(error, OperationType.WRITE, 'trash/products');
            }
        },
        restoreFromTrash: async (product) => {
            try {
                const { deletedAt, id, ...productData } = product;
                // Ensure no internal ID field pollutes the new document body
                if (productData.id) delete productData.id;

                await addDoc(collection(db, 'products'), {
                    ...productData,
                    createdAt: new Date().toISOString()
                });
                await deleteDoc(doc(db, 'trash', id));
                await DB.addLog({
                    productName: product.name,
                    price: product.price,
                    type: 'RESTORED',
                    status: 'RESTORED'
                });
            } catch (error) {
                handleFirestoreError(error, OperationType.WRITE, 'products/trash');
            }
        },
        wipeFromTrash: async (id) => {
            try {
                await deleteDoc(doc(db, 'trash', id));
            } catch (error) {
                handleFirestoreError(error, OperationType.DELETE, `trash/${id}`);
            }
        },
        addLog: async (logInfo) => {
            try {
                await addDoc(collection(db, 'logs'), {
                    ...logInfo,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, 'logs');
            }
        },
        updateOrderStatus: async (orderId, newStatus) => {
            try {
                await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
            } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
            }
        }
    };

    // 1. CUSTOM CURSOR
    const cursor = document.querySelector('.cursor');
    const cursorGlow = document.querySelector('.cursor-glow');

    if (cursor && cursorGlow) {
        document.addEventListener('mousemove', (e) => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
            setTimeout(() => {
                cursorGlow.style.left = (e.clientX - 16) + 'px';
                cursorGlow.style.top = (e.clientY - 16) + 'px';
            }, 50);
        });

        const updateCursorHover = () => {
            const clickables = document.querySelectorAll('a, button, .product-card, .insta-item, [onclick]');
            clickables.forEach(el => {
                el.addEventListener('mouseenter', () => {
                    cursor.style.transform = 'scale(4)';
                    cursor.style.background = 'transparent';
                    cursor.style.border = '1px solid white';
                });
                el.addEventListener('mouseleave', () => {
                    cursor.style.transform = 'scale(1)';
                    cursor.style.background = 'white';
                    cursor.style.border = 'none';
                });
            });
        };
        updateCursorHover();
        window.addEventListener('viewChanged', updateCursorHover);
    }

    // 1. BACKGROUND CANVAS ANIMATION
    const canvas = document.getElementById('bg-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        class Particle {
            constructor() { this.init(); }
            init() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 0.5;
                this.speedX = Math.random() * 0.5 - 0.25;
                this.speedY = Math.random() * 0.5 - 0.25;
                this.opacity = Math.random() * 0.5 + 0.1;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x > canvas.width) this.x = 0;
                if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0;
                if (this.y < 0) this.y = canvas.height;
            }
            draw() {
                ctx.fillStyle = `rgba(138, 43, 226, ${this.opacity})`;
                ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
            }
        }

        for (let i = 0; i < 100; i++) particles.push(new Particle());

        const animateBackground = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => { p.update(); p.draw(); });
            requestAnimationFrame(animateBackground);
        };
        animateBackground();
    }

    // 2. VIEW CONTROLLER (SPA Logic)
    const sections = {
        home: ['home', 'features', 'featured', 'about', 'testimonials', 'newsletter'],
        shop: ['shop'],
        cart: ['cart'],
        admin: ['admin']
    };

    // 2.1 SECURITY LAYER / FIREWALL
    const ADMIN_EMAIL = 'sehabiissam8@gmail.com'; // Hardcoded admin for this project

    const Firewall = {
        isAuthenticated: () => {
            return auth.currentUser !== null;
        },
        isAdmin: () => {
            return Firewall.isAuthenticated() && auth.currentUser.email === ADMIN_EMAIL;
        },
        initiateSession: async (email, password) => {
            try {
                console.log('[SESSION_START_REQUEST]', email);
                if (email !== ADMIN_EMAIL) {
                    console.warn('[SESSION_REJECTED] NON-ADMIN EMAIL');
                    showToast('ACCESS DENIED: UNAUTHORIZED AGENT.');
                    return false;
                }
                const result = await signInWithEmailAndPassword(auth, email, password);
                console.log('[FIREBASE_AUTH_RESULT]', result.user.email);
                if (result.user.email === ADMIN_EMAIL) {
                    const modal = document.getElementById('admin-gate-modal');
                    if (modal) modal.classList.remove('active');
                    showToast('SYSTEM ACCESS GRANTED: WELCOME ADMIN.');
                    showView('admin');
                    return true;
                } else {
                    console.warn('[SESSION_REJECTED] AUTH SUCCESS BUT EMAIL MISMATCH');
                    showToast('ACCESS DENIED: INSUFFICIENT PRIVILEGES.');
                    await signOut(auth);
                    return false;
                }
            } catch (error) {
                console.error('[SESSION_ERROR]', error);
                const errorEl = document.getElementById('login-error');
                if (errorEl) {
                    errorEl.textContent = 'ACCESS DENIED: INVALID KEY OR EMAIL.';
                    errorEl.style.display = 'block';
                    setTimeout(() => errorEl.style.display = 'none', 3000);
                }
                showToast('AUTH ERROR: REJECTION DETECTED.');
                return false;
            }
        },
        terminateSession: async () => {
            await signOut(auth);
            showToast('SESSION TERMINATED: CLEARING CACHE.');
            showView('home');
        },
        guard: (viewKey) => {
            if (viewKey === 'admin' && !Firewall.isAdmin()) {
                console.warn('FIREWALL: UNAUTHORIZED ACCESS ATTEMPT DETECTED.');
                document.getElementById('admin-gate-modal').classList.add('active');
                return false;
            }
            return true;
        }
    };

    // Firebase Auth State Listener
    onAuthStateChanged(auth, async (user) => {
        console.log('[AUTH_STATE_CHANGE]', user ? user.email : 'NULL');
        if (user) {
            console.log('[AUTH_STATE]', user);
            if (user.email === ADMIN_EMAIL) {
                console.log('ADMIN DETECTED:', user.email);
                const modal = document.getElementById('admin-gate-modal');
                if (modal && modal.classList.contains('active')) {
                     modal.classList.remove('active');
                     showView('admin');
                }
            } else {
                console.warn('UNAUTHORIZED ACCESS DETECTED: LOGGING OUT.');
                showToast('UNAUTHORIZED AGENT DETECTED. CLEARING SYSTEM.');
                await signOut(auth);
                showView('home');
            }
        } else {
            console.log('UNAUTHENTICATED');
            const sections = document.querySelectorAll('section');
            sections.forEach(s => {
                if (s.id === 'admin' && s.style.display === 'block') {
                    showView('home');
                }
            });
        }
    });

    // STARTING FIREBASE REALTIME LISTENERS
    const startListeners = () => {
        // Products Listener
        onSnapshot(collection(db, 'products'), (snapshot) => {
            state.products = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            renderStore();
            if (Firewall.isAdmin()) renderAdmin();
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

        // Orders Listener
        const ordersRef = collection(db, 'orders');
        const ordersQuery = query(ordersRef, orderBy('createdAt', 'desc'));
        
        onSnapshot(ordersQuery, (snapshot) => {
            console.log('[SYSTEM] ORDERS_SYNC_RECEIVED:', snapshot.docs.length);

            state.orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            console.log('[SYSTEM] STATE_ORDERS_UPDATED:', state.orders);

            if (Firewall.isAdmin()) {
                console.log('[SYSTEM] ADMIN_DETECTED -> EXECUTING_ORDER_RENDER');
                renderAdmin();
            }
        }, (err) => {
            console.error('[SYSTEM] ORDERS_LISTENER_CRITICAL_ERROR:', err);
            if (Firewall.isAdmin()) handleFirestoreError(err, OperationType.LIST, 'orders');
        });

        // Logs Listener
        onSnapshot(collection(db, 'logs'), (snapshot) => {
            state.logs = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            if (Firewall.isAdmin()) renderLogs();
        }, (err) => {
            if (Firewall.isAdmin()) handleFirestoreError(err, OperationType.LIST, 'logs');
        });

        // Trash Listener
        onSnapshot(collection(db, 'trash'), (snapshot) => {
            state.trash = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            if (Firewall.isAdmin()) renderTrash();
        }, (err) => {
            if (Firewall.isAdmin()) handleFirestoreError(err, OperationType.LIST, 'trash');
        });
    };
    startListeners();

    const mobileMenu = document.getElementById('mobile-menu');
    const mobileToggle = document.getElementById('mobile-toggle');
    const menuClose = document.getElementById('menu-close');

    const toggleMobileMenu = () => {
        if (!mobileMenu) return;
        mobileMenu.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : 'auto';
    };

    if (mobileToggle) mobileToggle.addEventListener('click', toggleMobileMenu);
    if (menuClose) menuClose.addEventListener('click', toggleMobileMenu);

    const showView = (viewKey) => {
        // Firewall Check: Redirect if unauthorized
        if (!Firewall.guard(viewKey)) return;

        const nav = document.querySelector('.nav');
        if (viewKey === 'admin') {
            if (nav) nav.style.display = 'none';
        } else {
            if (nav) nav.style.display = 'flex';
        }

        if (mobileMenu && mobileMenu.classList.contains('active')) toggleMobileMenu();

        document.querySelectorAll('section, footer').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('active');
        });

        const toShow = sections[viewKey] || sections.home;
        toShow.forEach(id => {
            const el = document.getElementById(id) || document.querySelector(`.${id}`);
            if (el) {
                el.style.display = 'block';
                setTimeout(() => el.classList.add('active'), 50);
            }
        });
        
        if (viewKey !== 'admin') {
            const foot = document.querySelector('.footer');
            if (foot) foot.style.display = 'block';
        }
        
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event('viewChanged'));

        if (viewKey === 'shop' || viewKey === 'home') renderStore();
        if (viewKey === 'admin') {
            renderAdmin();
            renderLogs();
            renderTrash();
        }
    };

    // 2.1 ADMIN AUTH
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('[LOGIN_FORM_SUBMITTED]');
            console.log('[LOGIN_ATTEMPT]');

            const emailInput = document.getElementById('admin-email');
            const passwordInput = document.getElementById('admin-password');
            
            if (!emailInput || !passwordInput) {
                console.error('[LOGIN_ERROR] FORM INPUTS NOT FOUND');
                return;
            }

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                showToast('EMAIL AND PASSWORD REQUIRED');
                return;
            }

            try {
                const success = await Firewall.initiateSession(email, password);
                if (success) {
                    console.log('[LOGIN_SUCCESS]');
                }
            } catch (error) {
                console.error('[LOGIN_ERROR]', error);
                showToast('LOGIN FAILED');
            }
        });
    }

    // 3. RENDER STORE PRODUCTS
    const renderStore = () => {
        const products = state.products;
        const mainGrid = document.getElementById('main-product-grid');
        const featuredGrid = document.querySelector('#featured .product-grid');

        const productToHTML = (p) => `
            <div class="product-card" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.img}">
                <div class="product-img-wrapper">
                    <img src="${p.img}" alt="${p.name}">
                    <div class="product-overlay">
                        <button class="btn btn-mini add-to-cart">ADD TO CART</button>
                    </div>
                </div>
                <div class="product-info">
                    <div class="product-meta">
                        <span class="label">${p.category}</span>
                        <span class="price">${p.price.toLocaleString()} DZD</span>
                    </div>
                    <h3 class="product-name">${p.name}</h3>
                </div>
            </div>
        `;

        if (mainGrid) mainGrid.innerHTML = products.map(productToHTML).join('');
        if (featuredGrid) featuredGrid.innerHTML = products.slice(0, 3).map(productToHTML).join('');
    };

    // 4. CART SYSTEM
    let cart = [];
    const cartBadge = document.querySelector('.cart-count');
    const cartBadgeMobile = document.querySelector('.cart-count-mobile');
    const cartItemsList = document.getElementById('cart-items-list');
    const subtotalEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total-price');
    let viewingCart = false;

    const updateCartUI = () => {
        const totalQuantity = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
        if (cartBadge) cartBadge.textContent = totalQuantity;
        if (cartBadgeMobile) cartBadgeMobile.textContent = totalQuantity;
        if (cartBadge) {
            cartBadge.style.transform = 'scale(1.5)';
            setTimeout(() => cartBadge.style.transform = 'scale(1)', 200);
        }
        if (viewingCart) renderCart();
    };

    const renderCart = () => {
        if (!cartItemsList) return;
        if (cart.length === 0) {
            cartItemsList.innerHTML = '<p class="empty-msg">YOUR BAG IS EMPTY. START EXPLORING.</p>';
            if (subtotalEl) subtotalEl.textContent = '0 DZD';
            if (totalEl) totalEl.textContent = '500 DZD';
            return;
        }
        let subtotal = 0;
        cartItemsList.innerHTML = '';
        cart.forEach((item, index) => {
            const itemQty = item.quantity || 1;
            subtotal += item.price * itemQty;
            cartItemsList.insertAdjacentHTML('beforeend', `
                <div class="cart-item">
                    <img src="${item.img}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-info">
                        <h4 class="cart-item-name">${item.name}</h4>
                        <p class="cart-item-price">${item.price.toLocaleString()} DZD</p>
                        <button class="remove-btn" data-index="${index}"><i class="fa-solid fa-trash-can"></i> REMOVE FROM ENTRANCE</button>
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" data-index="${index}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
                        <span>${itemQty}</span>
                        <button class="qty-btn" data-index="${index}" data-delta="1"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>
            `);
        });
        if (subtotalEl) subtotalEl.textContent = `${subtotal.toLocaleString()} DZD`;
        if (totalEl) totalEl.textContent = `${(subtotal + 500).toLocaleString()} DZD`;
    };

    if (cartItemsList) {
        cartItemsList.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (e.target.classList.contains('remove-btn')) { cart.splice(idx, 1); updateCartUI(); }
            else if (e.target.classList.contains('qty-btn')) {
                const delta = parseInt(e.target.dataset.delta);
                const currentQty = cart[idx].quantity || 1;
                cart[idx].quantity = currentQty + delta;
                if (cart[idx].quantity < 1) cart[idx].quantity = 1;
                updateCartUI();
            }
        });
    }

    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-to-cart')) {
            const card = e.target.closest('.product-card');
            const product = { 
                id: card.dataset.id, 
                name: card.dataset.name, 
                price: parseInt(card.dataset.price), 
                img: card.dataset.img, 
                quantity: 1 
            };
            const existing = cart.find(item => item.id === product.id);
            if (existing) {
                existing.quantity = (existing.quantity || 0) + 1;
            } else {
                cart.push(product);
            }
            updateCartUI();
            const btn = e.target; const originalText = btn.textContent;
            btn.textContent = 'ADDED!'; btn.style.background = 'white'; btn.style.color = 'black';
            setTimeout(() => { btn.textContent = originalText; btn.style.background = 'var(--accent)'; btn.style.color = 'white'; }, 1000);
        }
    });

    // 5. ADMIN PANEL LOGIC
    const renderAdmin = () => {
        if (!Firewall.isAdmin()) return; 

        const products = state.products;
        const orders = state.orders;
        const adminProductList = document.getElementById('admin-product-list');
        const adminOrderList = document.getElementById('admin-order-list');
        
        if (adminProductList) {
            if (products.length === 0) {
                adminProductList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">NO PRODUCTS IN DATABASE</td></tr>';
            } else {
                adminProductList.innerHTML = products.map(p => `
                    <tr id="admin-row-${p.id}">
                        <td><img src="${p.img}" class="admin-img-thumb" alt=""></td>
                        <td>${p.name}</td>
                        <td>${p.category}</td>
                        <td>${p.price.toLocaleString()} DZD</td>
                        <td>
                            <button class="action-btn edit-btn" title="EDIT" onclick="openEditProduct('${p.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="action-btn delete-btn" title="DELETE" onclick="deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            }
        }
        if (adminOrderList) {
            console.log('[SYSTEM] RENDERING_ADMIN_ORDERS:', orders.length);
            adminOrderList.innerHTML = [...orders]
                .map(o => {
                    const totalItems = (o.items || []).reduce((acc, item) => acc + (item.quantity || 1), 0);
                    return `
                    <tr class="reveal active">
                        <td>#${o.id ? o.id.slice(-4) : '????'}</td>
                        <td>
                            <strong>${o.customer?.name || 'UNKNOWN AGENT'}</strong><br>
                            <small>${o.customer?.email || 'NO EMAIL'}</small><br>
                            <small>${o.customer?.address || 'NO ADDRESS'}</small>
                        </td>
                        <td>${totalItems} PCS</td>
                        <td>${(o.total || 0).toLocaleString()} DZD</td>
                        <td>
                            <select class="admin-select-status" onchange="updateOrderStatus('${o.id}', this.value)">
                                <option value="PENDING" ${o.status === 'PENDING' ? 'selected' : ''}>PENDING</option>
                                <option value="PROCESSING" ${o.status === 'PROCESSING' ? 'selected' : ''}>PROCESSING</option>
                                <option value="COMPLETED" ${o.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
                                <option value="CANCELLED" ${o.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                            </select>
                        </td>
                        <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                `}).join('');
            console.log('[SYSTEM] ADMIN_ORDERS_RENDER_COMPLETE');
        }
    };

    window.updateOrderStatus = async (id, status) => {
        if (!Firewall.isAdmin()) return;
        await DB.updateOrderStatus(id, status);
        showToast(`ORDER #${id.slice(-4)} STATUS: ${status}`);
    };

    const renderLogs = () => {
        if (!Firewall.isAdmin()) return;
        const logs = state.logs;
        const logsList = document.getElementById('admin-log-list');
        if (logsList) {
            if (logs.length === 0) {
                logsList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">NO SYSTEM ACTIVITY LOGGED.</td></tr>';
            } else {
                logsList.innerHTML = [...logs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).map(log => `
                    <tr>
                        <td>${log.productName}</td>
                        <td>${log.price.toLocaleString()} DZD</td>
                        <td>${new Date(log.timestamp).toLocaleString()}</td>
                        <td><span class="status-badge status-${log.status.toLowerCase()}">${log.status}</span></td>
                        <td>${log.type}</td>
                    </tr>
                `).join('');
            }
        }
    };

    const renderTrash = () => {
        if (!Firewall.isAdmin()) return;
        const trash = state.trash;
        const trashList = document.getElementById('admin-trash-list');
        if (trashList) {
            if (trash.length === 0) {
                trashList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">TRASH IS EMPTY. NOTHING TO RECOVER.</td></tr>';
            } else {
                trashList.innerHTML = [...trash].sort((a,b) => new Date(b.deletedAt) - new Date(a.deletedAt)).map(p => `
                    <tr id="trash-row-${p.id}">
                        <td><img src="${p.img}" class="admin-img-thumb" alt=""></td>
                        <td>${p.name}</td>
                        <td>${p.price.toLocaleString()} DZD</td>
                        <td>${new Date(p.deletedAt).toLocaleDateString()}</td>
                        <td>
                            <button class="action-btn edit-btn" title="RESTORE" onclick="restoreProduct('${p.id}')"><i class="fa-solid fa-rotate-left"></i></button>
                            <button class="action-btn delete-btn" title="WIPE" onclick="permanentDelete('${p.id}')"><i class="fa-solid fa-skull"></i></button>
                        </td>
                    </tr>
                `).join('');
            }
        }
    };

    let productToDeleteId = null;
    let productToWipeId = null;
    let recoveryBuffer = null;

    window.deleteProduct = (id) => { 
        if (!Firewall.isAdmin()) return alert('SECURITY PROTOCOL: UNAUTHORIZED ACCESS BLOCKED.');
        
        productToDeleteId = id;
        document.getElementById('delete-modal').classList.add('active');
    };

    window.restoreProduct = async (id) => {
        if (!Firewall.isAdmin()) return;
        const product = state.trash.find(p => p.id === id);
        
        if (product) {
            const row = document.getElementById(`trash-row-${id}`);
            if (row) row.classList.add('row-exit');
            await new Promise(r => setTimeout(r, 500));

            await DB.restoreFromTrash(product);
            showToast(`GEAR RESTORED: ${product.name}`);
        }
    };

    window.permanentDelete = (id) => {
        if (!Firewall.isAdmin()) return;
        productToWipeId = id;
        document.getElementById('wipe-modal').classList.add('active');
    };

    const confirmWipeBtn = document.getElementById('confirm-wipe-btn');
    if (confirmWipeBtn) {
        confirmWipeBtn.addEventListener('click', async () => {
            if (!productToWipeId) return;
            
            const originalText = confirmWipeBtn.innerHTML;
            confirmWipeBtn.disabled = true;
            confirmWipeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> WIPING...';

            try {
                const product = state.trash.find(p => p.id === productToWipeId);
                if (product) {
                    const row = document.getElementById(`trash-row-${productToWipeId}`);
                    if (row) row.classList.add('row-exit');
                    
                    await new Promise(r => setTimeout(r, 500)); // Wait for animation
                    await DB.wipeFromTrash(productToWipeId);
                    showToast(`PERMANENT WIPEOUT COMPLETE: ${product.name}`);
                }
                document.getElementById('wipe-modal').classList.remove('active');
                productToWipeId = null;
            } catch (error) {
                console.error('WIPE ERROR:', error);
                showToast('SYSTEM ERROR: WIPEOUT FAILED.');
            } finally {
                confirmWipeBtn.disabled = false;
                confirmWipeBtn.innerHTML = originalText;
            }
        });
    }

    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!productToDeleteId) return;

            const originalText = confirmDeleteBtn.innerHTML;
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> DELETING...';

            try {
                const productToDelete = state.products.find(p => p.id === productToDeleteId);
                if (productToDelete) {
                    const row = document.getElementById(`admin-row-${productToDeleteId}`);
                    if (row) row.classList.add('row-exit');
                    
                    await new Promise(r => setTimeout(r, 500)); // Wait for animation
                    await DB.deleteToTrash(productToDelete);
                    showToast(`GEAR SHUTDOWN: ${productToDelete.name}`);
                }
                
                document.getElementById('delete-modal').classList.remove('active');
                productToDeleteId = null;
            } catch (error) {
                console.error('DELETION ERROR:', error);
                showToast('FAILED TO DELETE PRODUCT.');
                document.getElementById('delete-modal').classList.remove('active');
            } finally {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.innerHTML = originalText;
            }
        });
    }

    window.openEditProduct = (id) => {
        if (!Firewall.isAdmin()) {
            showToast('ACCESS DENIED: UNAUTHORIZED ACTION.');
            return;
        }
        const p = state.products.find(p => p.id === id);
        if (p) {
            document.getElementById('product-modal-title').innerHTML = 'EDIT <span class="accent">PRODUCT</span>';
            document.getElementById('edit-id').value = p.id;
            document.getElementById('p-name').value = p.name;
            document.getElementById('p-category').value = p.category;
            document.getElementById('p-price').value = p.price;
            
            // Set URL and preview
            urlInput.value = p.img;
            selectedImageFile = null;
            fileInput.value = '';
            // Reset state
            selectedImageFile = null;
            setProcessingState(false);
            
            // Reset dropzone UI
            const dropzoneText = dropzone.querySelector('p');
            const dropzoneIcon = dropzone.querySelector('i');
            if (dropzoneText) dropzoneText.innerHTML = 'DRAG GEAR OR <span class="accent">BROWSE</span>';
            if (dropzoneIcon) dropzoneIcon.className = 'fa-solid fa-cloud-arrow-up';

            updateImgMode('url');
            showPreview(p.img);
            
            document.getElementById('product-modal').classList.add('active');
        }
    };

    const addProductBtn = document.getElementById('add-product-trigger');
    const productForm = document.getElementById('product-form');
    const imgModes = document.querySelectorAll('.product-img-mode');
    const urlWrapper = document.getElementById('p-img-url-wrapper');
    const uploadWrapper = document.getElementById('p-img-upload-wrapper');
    const imgPreviewContainer = document.getElementById('p-img-preview-container');
    const imgPreview = document.getElementById('p-img-preview');
    const urlInput = document.getElementById('p-img');
    const fileInput = document.getElementById('p-img-file');
    const dropzone = document.getElementById('image-dropzone');
    const removePreviewBtn = document.getElementById('remove-preview');
    
    let currentImageMode = 'url';
    let selectedImageFile = null;
    let isProcessing = false;

    const setProcessingState = (processing) => {
        isProcessing = processing;
        const saveBtn = document.getElementById('product-save-btn');
        if (!saveBtn) return;

        if (isProcessing) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESSING...';
            saveBtn.style.opacity = '0.7';
            saveBtn.style.cursor = 'not-allowed';
            saveBtn.style.boxShadow = '0 0 20px rgba(0, 255, 242, 0.2)';
        } else {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'SAVE PRODUCT';
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.boxShadow = 'none';
        }
    };

    const uploadImage = (file) => {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", "dyqf4ck8h");

            const xhr = new XMLHttpRequest();
            const dropzoneText = dropzone.querySelector('p');
            const dropzoneIcon = dropzone.querySelector('i');
            const originalText = 'DRAG GEAR OR <span class="accent">BROWSE</span>';
            const originalIconClass = 'fa-solid fa-cloud-arrow-up';

            // Create progress bar if not exists
            let progressBar = dropzone.querySelector('.upload-progress-bar');
            if (!progressBar) {
                progressBar = document.createElement('div');
                progressBar.className = 'upload-progress-bar';
                progressBar.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 0%;
                    height: 3px;
                    background: var(--accent);
                    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 0 15px var(--accent);
                    z-index: 10;
                `;
                dropzone.appendChild(progressBar);
            }
            
            progressBar.style.width = '0%';
            if (dropzoneIcon) dropzoneIcon.className = 'fa-solid fa-spinner fa-spin';
            dropzone.style.borderColor = 'var(--accent)';

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    if (dropzoneText) dropzoneText.innerHTML = `UPLOADING GEAR... <span class="accent">${percent}%</span>`;
                    progressBar.style.width = `${percent}%`;
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.secure_url) {
                        progressBar.style.width = '100%';
                        if (dropzoneText) dropzoneText.innerHTML = '<i class="fa-solid fa-check"></i> IMAGE SECURED';
                        if (dropzoneIcon) dropzoneIcon.className = 'fa-solid fa-circle-check';
                        
                        setTimeout(() => {
                            progressBar.style.width = '0%';
                            resolve(data.secure_url);
                        }, 1000);
                    } else {
                        reject(new Error("UPLOAD FAILED: NO URL"));
                    }
                } else {
                    reject(new Error(`UPLOAD FAILED: ${xhr.statusText}`));
                }
            };

            xhr.onerror = () => {
                progressBar.style.width = '0%';
                if (dropzoneText) dropzoneText.innerHTML = '<span style="color: #ff4d4d">UPLOAD FAILED</span>';
                if (dropzoneIcon) dropzoneIcon.className = 'fa-solid fa-triangle-exclamation';
                setTimeout(() => {
                    if (dropzoneText) dropzoneText.innerHTML = originalText;
                    if (dropzoneIcon) dropzoneIcon.className = originalIconClass;
                }, 3000);
                reject(new Error("NETWORK ERROR"));
            };

            xhr.open("POST", "https://api.cloudinary.com/v1_1/dyqf4ck8h/image/upload");
            xhr.send(formData);
        });
    };


    const updateImgMode = (mode) => {
        currentImageMode = mode;
        imgModes.forEach(b => {
            const isActive = b.dataset.mode === mode;
            b.classList.toggle('active', isActive);
            if (isActive) {
                b.style.background = 'var(--accent)';
                b.style.color = '#000';
                b.style.boxShadow = '0 0 10px rgba(0,255,242,0.3)';
            } else {
                b.style.background = 'transparent';
                b.style.color = 'rgba(255,255,255,0.4)';
                b.style.boxShadow = 'none';
            }
        });
        
        if (mode === 'url') {
            urlWrapper.style.display = 'block';
            uploadWrapper.style.display = 'none';
            if (urlInput.value && urlInput.value.length > 5) showPreview(urlInput.value);
            else hidePreview();
        } else {
            urlWrapper.style.display = 'none';
            uploadWrapper.style.display = 'block';
            if (selectedImageFile) {
                const reader = new FileReader();
                reader.onload = (e) => showPreview(e.target.result);
                reader.readAsDataURL(selectedImageFile);
            } else hidePreview();
        }
    };

    const showPreview = (src) => {
        imgPreview.src = src;
        imgPreviewContainer.style.display = 'block';
    };

    const hidePreview = () => {
        imgPreview.src = '';
        imgPreviewContainer.style.display = 'none';
    };

    imgModes.forEach(btn => btn.addEventListener('click', () => updateImgMode(btn.dataset.mode)));

    urlInput.addEventListener('input', (e) => {
        urlWrapper.style.borderColor = 'rgba(255,255,255,0.1)';
        uploadWrapper.style.borderColor = 'rgba(255,255,255,0.1)';
        if (currentImageMode === 'url' && e.target.value) showPreview(e.target.value);
        else if (currentImageMode === 'url') hidePreview();
    });

    fileInput.addEventListener('change', (e) => {
        urlWrapper.style.borderColor = 'rgba(255,255,255,0.1)';
        uploadWrapper.style.borderColor = 'rgba(255,255,255,0.1)';
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = (ev) => showPreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    });

    removePreviewBtn.addEventListener('click', () => {
        selectedImageFile = null;
        fileInput.value = '';
        urlInput.value = '';
        hidePreview();
        const dropzoneText = dropzone.querySelector('p');
        const dropzoneIcon = dropzone.querySelector('i');
        if (dropzoneText) dropzoneText.innerHTML = 'DRAG GEAR OR <span class="accent">BROWSE</span>';
        if (dropzoneIcon) dropzoneIcon.className = 'fa-solid fa-cloud-arrow-up';
    });

    // Handle Drag and Drop
    if (dropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        dropzone.addEventListener('dragover', () => { dropzone.style.borderColor = 'var(--accent)'; dropzone.style.background = 'rgba(0,255,242,0.05)'; });
        dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(255,255,255,0.1)'; dropzone.style.background = 'transparent'; });
        dropzone.addEventListener('drop', (e) => {
            dropzone.style.borderColor = 'rgba(255,255,255,0.1)';
            dropzone.style.background = 'transparent';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                selectedImageFile = file;
                fileInput.files = e.dataTransfer.files;
                const reader = new FileReader();
                reader.onload = (ev) => showPreview(ev.target.result);
                reader.readAsDataURL(file);
            }
        });
    }

    if (addProductBtn) { 
        addProductBtn.addEventListener('click', () => { 
            document.getElementById('product-modal-title').innerHTML = 'ADD <span class="accent">PRODUCT</span>'; 
            productForm.reset(); 
            document.getElementById('edit-id').value = ''; 
            selectedImageFile = null;
            setProcessingState(false);
            hidePreview();
            updateImgMode('url');
            
            // Reset dropzone UI
            const dropzoneText = dropzone.querySelector('p');
            const dropzoneIcon = dropzone.querySelector('i');
            if (dropzoneText) dropzoneText.innerHTML = 'DRAG GEAR OR <span class="accent">BROWSE</span>';
            if (dropzoneIcon) dropzoneIcon.className = 'fa-solid fa-cloud-arrow-up';
            
            document.getElementById('product-modal').classList.add('active'); 
        }); 
    }
    
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            if (!Firewall.isAdmin() || isProcessing) return;

            console.log('[SAVE_CLICKED]');

            // 1. Gather Data & Validate
            const editId = document.getElementById('edit-id').value;
            const pName = document.getElementById('p-name').value.trim();
            const pCategory = document.getElementById('p-category').value;
            const pPrice = parseInt(document.getElementById('p-price').value);
            const pUrl = urlInput.value.trim();
            const existingImg = (imgPreview.src && !imgPreview.src.startsWith('data:')) ? imgPreview.src : null;

            if (!pName || isNaN(pPrice)) {
                return showToast('VALIDATION ERROR: MISSING NAME OR PRICE.');
            }

            setProcessingState(true);

            try {
                let finalImgUrl = '';

                // 2. LINEAR PIPELINE: IMAGE ACQUISITION
                if (currentImageMode === 'url') {
                    finalImgUrl = pUrl || existingImg;
                    if (!finalImgUrl) throw new Error('IMAGE URL REQUIRED.');
                } else {
                    if (selectedImageFile) {
                        showToast('INITIATING UPLOAD...');
                        console.log('[UPLOAD_START]');
                        finalImgUrl = await uploadImage(selectedImageFile);
                        console.log('[UPLOAD_DONE] URL:', finalImgUrl);
                    } else if (existingImg) {
                        finalImgUrl = existingImg;
                    } else {
                        throw new Error('NO IMAGE PROVIDED.');
                    }
                }

                if (!finalImgUrl) throw new Error("UPLOAD FAILED");

                // 3. FIRESTORE PERSISTENCE
                const productData = { name: pName, category: pCategory, price: pPrice, img: finalImgUrl };
                console.log('[SAVE_START]', productData);
                
                if (editId) { 
                    await DB.updateProduct(editId, productData); 
                } else {
                    await DB.addProduct(productData);
                }
                console.log('[SAVE_SUCCESS]');
                showToast(editId ? 'GEAR UPDATED.' : 'NEW GEAR REGISTERED.');
                
                // 4. CLEANUP
                const modal = document.getElementById('product-modal');
                if (modal) modal.classList.remove('active'); 
                
                productForm.reset();
                selectedImageFile = null;
                fileInput.value = '';
                hidePreview();

            } catch (err) {
                console.error('[SAVE_ERROR]:', err);
                showToast(`REJECTION: ${err.message}`);
            } finally {
                console.log('[FINALLY_BLOCK_REACHED]');
                setProcessingState(false);
            }
        });
    }

    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('logout-btn')) { 
                Firewall.terminateSession();
                return; 
            }
            if (!Firewall.isAuthenticated()) return;

            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active'); document.getElementById(`admin-${btn.dataset.tab}`).classList.add('active');
            
            if (btn.dataset.tab === 'logs') renderLogs();
            if (btn.dataset.tab === 'trash') renderTrash();
        });
    });

    // 5.1 SECURITY SETTINGS LOGIC (RESTRICTED TO ADMIN)
    const securityUpdateForm = document.getElementById('security-update-form');
    if (securityUpdateForm) {
        securityUpdateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!Firewall.isAdmin()) {
                showToast('SECURITY BREACH: UNAUTHORIZED SYSTEM MODIFICATION ATTEMPT.');
                return;
            }

            const currentPass = document.getElementById('current-pass').value;
            const newPass = document.getElementById('new-pass').value;
            const msg = document.getElementById('security-update-msg');
            const user = auth.currentUser;

            if (!user) return;

            try {
                // Re-authenticate user before changing password (required by Firebase for sensitive actions)
                const credential = EmailAuthProvider.credential(user.email, currentPass);
                await reauthenticateWithCredential(user, credential);
                
                // Update password
                await updatePassword(user, newPass);
                
                msg.textContent = 'SUCCESS: SYSTEM ACCESS KEY ROTATED.';
                msg.style.color = 'var(--accent)';
                msg.style.display = 'block';
                securityUpdateForm.reset();
                showToast('SYSTEM SECURITY UPDATED.');
                
                setTimeout(() => { msg.style.display = 'none'; }, 5000);
            } catch (error) {
                console.error('SECURITY UPDATE ERROR:', error);
                msg.textContent = 'ERROR: ' + (error.code === 'auth/wrong-password' ? 'INVALID CURRENT ACCESS KEY.' : 'UNABLE TO UPDATE KEY.');
                msg.style.color = '#ff4d4d';
                msg.style.display = 'block';
                showToast('SECURITY UPDATE FAILED.');
            }
        });
    }

    // 6. NAVIGATION & VIEWS
    document.querySelectorAll('a[href^="#"], .back-to-shop').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href'); if (!href || href.length <= 1) return;
            e.preventDefault(); const view = href.substring(1); viewingCart = (view === 'cart');
            if (view === 'admin-gate' || href === '#admin-gate') { 
                document.getElementById('admin-gate-modal').classList.add('active'); 
                return; 
            }
            if (view === 'admin') {
                if (Firewall.isAuthenticated()) showView('admin');
                else document.getElementById('admin-gate-modal').classList.add('active');
                return;
            }
            const homeSections = ['home', 'features', 'featured', 'about', 'testimonials', 'newsletter'];
            if (homeSections.includes(view)) { showView('home'); const el = document.getElementById(view); if (el) window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' }); }
            else if (view === 'shop') showView('shop');
            else if (view === 'cart') { showView('cart'); renderCart(); }
        });
    });

    const cartTrigger = document.querySelector('.cart-trigger');
    if (cartTrigger) { cartTrigger.addEventListener('click', () => { viewingCart = true; showView('cart'); renderCart(); }); }

    document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            e.preventDefault();
            btn.closest('.modal-overlay').classList.remove('active'); 
        }); 
    });

    // Close modals on background click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // Close modals on ESC key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });

    // 7. CHECKOUT LOGIC
    const orderForm = document.getElementById('order-form');
    const checkoutTrigger = document.querySelector('.checkout-trigger');
    if (checkoutTrigger) { checkoutTrigger.addEventListener('click', () => { if (cart.length === 0) { alert('YOUR BAG IS EMPTY.'); return; } document.getElementById('checkout-modal').classList.add('active'); document.getElementById('order-form').style.display = 'block'; document.getElementById('order-success').classList.remove('active'); }); }
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            console.log('[CHECKOUT_SUBMIT]');
            const inputs = orderForm.querySelectorAll('input');
            const customerName = inputs[0].value.trim();
            const customerEmail = inputs[1].value.trim();
            const customerAddress = orderForm.querySelector('textarea').value.trim();
            
            console.log('[CHECKOUT_START]');

            // Validation
            if (cart.length === 0) {
                showToast('YOUR BAG IS EMPTY.');
                return;
            }
            if (!customerName || !customerEmail || !customerAddress) {
                showToast('PLEASE COMPLETE ALL FIELDS.');
                return;
            }

            const total = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0) + 500;
            
            const newOrder = { 
                customer: { 
                    name: customerName, 
                    email: customerEmail, 
                    address: customerAddress 
                }, 
                items: cart, 
                total: total, 
                status: 'PENDING' 
            };

            try {
                await DB.saveOrder(newOrder);
                orderForm.style.display = 'none'; 
                document.getElementById('order-success').classList.add('active'); 
                cart = []; 
                updateCartUI();
            } catch (err) {
                console.error('[CHECKOUT_FAILED]', err);
                showToast('ORDER FAILED: UNABLE TO CONTACT SYSTEM.');
            }
        });
    }

    // STICKY NAV & EFFECTS
    const nav = document.querySelector('.nav');
    window.addEventListener('scroll', () => { if (nav) { if (window.scrollY > 50) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); } });
    const handleScrollReveal = () => { document.querySelectorAll('.reveal, .scale-up').forEach(el => { if (el.getBoundingClientRect().top < window.innerHeight - 100) el.classList.add('active'); }); };
    window.addEventListener('scroll', handleScrollReveal); setTimeout(handleScrollReveal, 500);
    window.addEventListener('scroll', () => { const heroImg = document.querySelector('.hero-img'); if (heroImg) heroImg.style.transform = `translateY(${window.pageYOffset * 0.4}px)`; });

    // 8. PASSWORD VISIBILITY TOGGLE SYSTEM
    const initPasswordToggles = () => {
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(input => {
            // Skip if already has a toggle nearby
            if (input.parentElement.classList.contains('password-wrapper')) return;

            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'password-wrapper';
            
            // Insert wrapper before input, then move input inside
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            // Create toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'password-toggle';
            toggleBtn.setAttribute('aria-label', 'Toggle Password Visibility');
            toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';

            wrapper.appendChild(toggleBtn);

            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                
                // Update icon
                const icon = toggleBtn.querySelector('i');
                if (type === 'text') {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                    toggleBtn.style.color = 'var(--accent)';
                    toggleBtn.style.opacity = '1';
                } else {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                    toggleBtn.style.color = 'var(--text-secondary)';
                    toggleBtn.style.opacity = '0.6';
                }
            });
        });
    };

    initPasswordToggles();
    // Re-run whenever modals might be re-rendered or content changes if needed
    window.addEventListener('viewChanged', initPasswordToggles);

    // HIDE LOADER - ENSURE SYSTEM ENTRANCE
    const hideLoader = () => {
        const loader = document.getElementById('app-loading');
        if (loader) {
            console.log('[SYSTEM] CLEARING APP LOADING OVERLAY.');
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.visibility = 'hidden';
                loader.remove();
                console.log('[SYSTEM] MAINFRAME SYNC COMPLETE.');
            }, 500);
        }
    };

    // Final safety: release loader after 4 seconds regardless
    setTimeout(hideLoader, 4000);

    // Also release loader once products are fetched or on home view
    showView('home');
    console.log('[SYSTEM] INITIALIZATION SEQUENCE TERMINATED.');
    
    // Slight delay for smooth entrance
    setTimeout(hideLoader, 1500);

    // REVIEWS SYSTEM
    const reviewModal = document.getElementById('review-modal');
    const reviewModalClose = document.getElementById('review-modal-close');
    const writeReviewBtn = document.getElementById('write-review-btn');
    const reviewForm = document.getElementById('review-form');
    const publicReviewsList = document.getElementById('public-reviews-list');
    const adminReviewList = document.getElementById('admin-review-list');

    writeReviewBtn?.addEventListener('click', () => {
        reviewModal?.classList.add('active');
    });

    reviewModalClose?.addEventListener('click', () => {
        reviewModal?.classList.remove('active');
    });

    reviewModal?.addEventListener('click', (e) => {
        if (e.target === reviewModal) {
            reviewModal.classList.remove('active');
        }
    });

    const renderStars = (count) => '★'.repeat(count) + '☆'.repeat(5 - count);

    reviewForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('review-name')?.value.trim();
        const rating = document.getElementById('review-rating')?.value;
        const text = document.getElementById('review-message')?.value.trim();

        if (!name || !rating || !text) {
            showToast('PLEASE COMPLETE ALL REVIEW FIELDS');
            return;
        }

        try {
            await addDoc(collection(db, 'reviews'), {
                name,
                rating: Number(rating),
                text,
                approved: false,
                createdAt: serverTimestamp()
            });

            showToast('REVIEW SUBMITTED FOR APPROVAL');
            reviewForm.reset();
            reviewModal.classList.remove('active');
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'reviews');
        }
    });

    const reviewsQuery = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));

    onSnapshot(reviewsQuery, (snapshot) => {
        if (publicReviewsList) publicReviewsList.innerHTML = '';
        if (adminReviewList) adminReviewList.innerHTML = '';

        snapshot.forEach((reviewDoc) => {
            const review = reviewDoc.data();
            const id = reviewDoc.id;

            if (review.approved && publicReviewsList) {
                const card = document.createElement('div');
                card.className = 'review-card';
                card.innerHTML = `
                    <div class="review-header">
                        <h3>${review.name}</h3>
                        <div class="review-stars">${renderStars(review.rating)}</div>
                    </div>
                    <p class="review-text">${review.text}</p>
                `;
                publicReviewsList.appendChild(card);
            }

            if (adminReviewList) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${review.name}</td>
                    <td>${review.rating}/5</td>
                    <td>${review.text}</td>
                    <td>${review.approved ? 'Approved' : 'Pending'}</td>
                    <td>
                        <button class="btn btn-mini approve-review-btn" data-id="${id}" data-approved="${review.approved}">${review.approved ? 'UNAPPROVE' : 'APPROVE'}</button>
                        <button class="btn btn-mini delete-review-btn" data-id="${id}">DELETE</button>
                    </td>
                `;
                adminReviewList.appendChild(row);
            }
        });

        document.querySelectorAll('.approve-review-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await updateDoc(doc(db, 'reviews', btn.dataset.id), {
                        approved: btn.dataset.approved !== 'true'
                    });
                    showToast('REVIEW STATUS UPDATED');
                } catch (error) {
                    handleFirestoreError(error, OperationType.UPDATE, 'reviews');
                }
            });
        });

        document.querySelectorAll('.delete-review-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('DELETE THIS REVIEW?')) return;

                try {
                    await deleteDoc(doc(db, 'reviews', btn.dataset.id));
                    showToast('REVIEW DELETED');
                } catch (error) {
                    handleFirestoreError(error, OperationType.DELETE, 'reviews');
                }
            });
        });
    });

});
