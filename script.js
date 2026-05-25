/**
 * 3DRIP | LUXURY STREETWEAR 2026
 * MAIN SCRIPT
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocFromServer,
  setDoc,
  getDoc,
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase
console.log("[SYSTEM] INITIALIZING FIREBASE MAINFRAME...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
console.log("[SYSTEM] FIREBASE CORE ONLINE.");

// Connectivity Test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

document.addEventListener("DOMContentLoaded", () => {
  // ===== THEME SYSTEM =====
  const themeToggle = document.getElementById('theme-toggle');
  const STORAGE_KEY = '3drip-theme';
  
  // Apply theme immediately to prevent flash
  const savedTheme = localStorage.getItem(STORAGE_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Update toggle icon to match current theme
  function updateThemeIcon(theme) {
    if (!themeToggle) return;
    const sunIcon = themeToggle.querySelector('.theme-icon-sun');
    const moonIcon = themeToggle.querySelector('.theme-icon-moon');
    if (theme === 'light') {
      sunIcon.style.opacity = '1';
      moonIcon.style.opacity = '0';
    } else {
      sunIcon.style.opacity = '0';
      moonIcon.style.opacity = '1';
    }
  }
  updateThemeIcon(savedTheme);
  
  // Toggle theme with smooth animation
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Add animation class
    if (themeToggle) themeToggle.classList.add('animating');
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    updateThemeIcon(newTheme);
    
    // Remove animation class after animation completes
    setTimeout(() => {
      if (themeToggle) themeToggle.classList.remove('animating');
    }, 400);
  }
  
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Mobile menu theme button
  const mobileThemeBtn = document.getElementById('mobile-theme-btn');
  if (mobileThemeBtn) {
    mobileThemeBtn.addEventListener('click', toggleTheme);
  }
  
  // Also listen for system preference changes (optional enhancement)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  prefersDark.addEventListener('change', (e) => {
    // Only apply if user hasn't manually set a preference
    if (!localStorage.getItem(STORAGE_KEY)) {
      const newTheme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      updateThemeIcon(newTheme);
    }
  });

  // Operation Types for error handling
  const OperationType = {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write",
  };

  const showToast = (msg, actionText, onAction) => {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
            <i class="fa-solid fa-bell" style="color: var(--accent);"></i>
            <span class="toast-msg">${msg}</span>
            ${actionText ? `<button class="undo-btn">${actionText}</button>` : ""}
        `;

    if (onAction) {
      toast.querySelector(".undo-btn").addEventListener("click", () => {
        onAction();
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 400);
      });
    }

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 400);
    }, 6000); // 6s duration
  };

  const isPermissionError = (message) =>
    /permission|insufficient permissions|not authorized/i.test(message);

  function handleFirestoreError(error, operationType, path) {
    const message = error instanceof Error ? error.message : String(error);
    const errInfo = {
      error: message,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path,
    };
    console.error("Firestore Error: ", JSON.stringify(errInfo));

    if (isPermissionError(message) && !Firewall.isAdmin()) {
      console.warn("Firestore permission access skipped:", message, path);
      return;
    }

    showToast(`ERROR: ${message || "PERMISSION DENIED"}`);
  }

  // Current state held in memory (synced with Firestore)
  let state = {
    products: [],
    orders: [],
    logs: [],
    trash: [],
    reviews: [],
    categories: [],
  };

  // Tracking active Firestore listeners for clean re-init
  const activeListeners = {
    products: null,
    orders: null,
    logs: null,
    trash: null,
    reviews: null,
    categories: null,
  };

  // Replace DB helper with Firestore logic
  const DB = {
    // Now mostly reactive listeners, but we keep the structure for compatibility
    saveOrder: async (orderData) => {
      try {
        console.log("[ORDER_SAVE_START]", orderData);

        const docRef = await addDoc(collection(db, "orders"), {
          ...orderData,
          createdAt: new Date().toISOString(),
        });

        console.log("[ORDER_SAVE_SUCCESS]", docRef.id);

        return docRef.id;
      } catch (error) {
        console.error("[ORDER_SAVE_ERROR]", error);
        throw error;
      }
    },
    addProduct: async (productData) => {
      if (!productData || !productData.img || productData.img.trim() === "") {
        throw new Error("SERVER REJECTION: IMAGE SOURCE REQUIRED.");
      }
      await addDoc(collection(db, "products"), {
        ...productData,
        createdAt: new Date().toISOString(),
      });
    },
    updateProduct: async (id, productData) => {
      if (!productData || !productData.img || productData.img.trim() === "") {
        throw new Error("SERVER REJECTION: IMAGE SOURCE REQUIRED.");
      }
      await updateDoc(doc(db, "products", id), productData);
    },
    deleteToTrash: async (product) => {
      try {
        const { id, ...productData } = product;
        // Move to trash collection first
        await addDoc(collection(db, "trash"), {
          ...productData,
          deletedAt: new Date().toISOString(),
        });
        // Then delete from products
        await deleteDoc(doc(db, "products", id));
        // Log action
        await DB.addLog({
          productName: productData.name,
          price: productData.price,
          type: "DELETED",
          status: "DELETED",
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "trash/products");
      }
    },
    restoreFromTrash: async (product) => {
      try {
        const { deletedAt, id, ...productData } = product;
        // Ensure no internal ID field pollutes the new document body
        if (productData.id) delete productData.id;

        await addDoc(collection(db, "products"), {
          ...productData,
          createdAt: new Date().toISOString(),
        });
        await deleteDoc(doc(db, "trash", id));
        await DB.addLog({
          productName: product.name,
          price: product.price,
          type: "RESTORED",
          status: "RESTORED",
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "products/trash");
      }
    },
    wipeFromTrash: async (id) => {
      try {
        await deleteDoc(doc(db, "trash", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `trash/${id}`);
      }
    },
    addLog: async (logInfo) => {
      try {
        await addDoc(collection(db, "logs"), {
          ...logInfo,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "logs");
      }
    },
    addCategory: async (categoryData) => {
      try {
        await addDoc(collection(db, "categories"), categoryData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "categories");
        throw error;
      }
    },
    deleteCategory: async (categoryId) => {
      try {
        await deleteDoc(doc(db, "categories", categoryId));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `categories/${categoryId}`,
        );
        throw error;
      }
    },
    updateOrderStatus: async (orderId, newStatus) => {
      try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      }
    },
    saveReview: async (reviewData) => {
      try {
        await addDoc(collection(db, "reviews"), {
          ...reviewData,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "reviews");
      }
    },
    updateReviewStatus: async (reviewId, newStatus) => {
      try {
        await updateDoc(doc(db, "reviews", reviewId), { status: newStatus });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `reviews/${reviewId}`,
        );
      }
    },
    toggleBestReview: async (reviewId, currentState) => {
      try {
        await updateDoc(doc(db, "reviews", reviewId), {
          isBest: !currentState,
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `reviews/${reviewId}/best`,
        );
      }
    },
    deleteReview: async (reviewId) => {
      try {
        await deleteDoc(doc(db, "reviews", reviewId));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `reviews/${reviewId}`,
        );
      }
    },
    deleteAllLogs: async () => {
      try {
        const batch = [];
        state.logs.forEach((log) => {
          batch.push(deleteDoc(doc(db, "logs", log.id)));
        });
        await Promise.all(batch);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "logs/all");
      }
    },
  };

  const isMobileCursor =
    window.matchMedia("(max-width: 768px)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

  if (isMobileCursor) {
    document.body.classList.add("no-custom-cursor");
  }

  // 1. CUSTOM CURSOR
  const cursor = document.querySelector(".cursor");
  const cursorGlow = document.querySelector(".cursor-glow");

  if (!isMobileCursor && cursor && cursorGlow) {
    document.addEventListener("mousemove", (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
      setTimeout(() => {
        cursorGlow.style.left = e.clientX - 16 + "px";
        cursorGlow.style.top = e.clientY - 16 + "px";
      }, 50);
    });

    const updateCursorHover = () => {
      const clickables = document.querySelectorAll(
        "a, button, .product-card, .insta-item, [onclick]",
      );
      clickables.forEach((el) => {
        el.addEventListener("mouseenter", () => {
          cursor.style.transform = "scale(4)";
          cursor.style.background = "transparent";
          cursor.style.border = "1px solid white";
        });
        el.addEventListener("mouseleave", () => {
          cursor.style.transform = "scale(1)";
          cursor.style.background = "white";
          cursor.style.border = "none";
        });
      });
    };
    updateCursorHover();
    window.addEventListener("viewChanged", updateCursorHover);
  }

  // 1. BACKGROUND CANVAS ANIMATION
  const canvas = document.getElementById("bg-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let particles = [];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    class Particle {
      constructor() {
        this.init();
      }
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
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 100; i++) particles.push(new Particle());

    const animateBackground = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animateBackground);
    };
    animateBackground();
  }

  // 2. VIEW CONTROLLER (SPA Logic)
  const sections = {
    home: [
      "home",
      "features",
      "featured",
      "about",
      "testimonials",
      "newsletter",
    ],
    shop: ["shop"],
    cart: ["cart"],
    admin: ["admin"],
    reviews: ["reviews"],
    wishlist: ["wishlist"],
    product: ["product-view"],
  };

  // 2.1 SECURITY LAYER / FIREWALL
  const ADMIN_EMAIL = "sehabiissam8@gmail.com"; // Hardcoded admin for this project

  const Firewall = {
    isAuthenticated: () => {
      return auth.currentUser !== null;
    },
    isAdmin: () => {
      return (
        Firewall.isAuthenticated() && auth.currentUser.email === ADMIN_EMAIL
      );
    },
    initiateSession: async (email, password) => {
      try {
        console.log("[SESSION_START_REQUEST]", email);
        if (email !== ADMIN_EMAIL) {
          console.warn("[SESSION_REJECTED] NON-ADMIN EMAIL");
          showToast("ACCESS DENIED: UNAUTHORIZED AGENT.");
          return false;
        }
        const result = await signInWithEmailAndPassword(auth, email, password);
        console.log("[FIREBASE_AUTH_RESULT]", result.user.email);
        if (result.user.email === ADMIN_EMAIL) {
          const modal = document.getElementById("admin-gate-modal");
          if (modal) modal.classList.remove("active");
          showToast("SYSTEM ACCESS GRANTED: WELCOME ADMIN.");
          showView("admin");
          return true;
        } else {
          console.warn("[SESSION_REJECTED] AUTH SUCCESS BUT EMAIL MISMATCH");
          showToast("ACCESS DENIED: INSUFFICIENT PRIVILEGES.");
          await signOut(auth);
          return false;
        }
      } catch (error) {
        console.error("[SESSION_ERROR]", error);
        const errorEl = document.getElementById("login-error");
        if (errorEl) {
          errorEl.textContent = "ACCESS DENIED: INVALID KEY OR EMAIL.";
          errorEl.style.display = "block";
          setTimeout(() => (errorEl.style.display = "none"), 3000);
        }
        showToast("AUTH ERROR: REJECTION DETECTED.");
        return false;
      }
    },
    terminateSession: async () => {
      await signOut(auth);
      showToast("SESSION TERMINATED: CLEARING CACHE.");
      showView("home");
    },
    guard: (viewKey) => {
      if (viewKey === "admin" && !Firewall.isAdmin()) {
        console.warn("FIREWALL: UNAUTHORIZED ACCESS ATTEMPT DETECTED.");
        document.getElementById("admin-gate-modal").classList.add("active");
        return false;
      }
      return true;
    },
  };

  // Firebase Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    console.log("[AUTH_STATE_CHANGE]", user ? user.email : "NULL");

    // RE-INIT LISTENERS ON AUTH CHANGE
    // This ensures listeners that require permissions (like orders)
    // are properly established once the auth token is available.
    startListeners();

    if (user) {
      console.log("[AUTH_STATE]", user);
      if (user.email === ADMIN_EMAIL) {
        console.log("ADMIN DETECTED:", user.email);
        const modal = document.getElementById("admin-gate-modal");
        if (modal && modal.classList.contains("active")) {
          modal.classList.remove("active");
          showView("admin");
        }
      } else {
        console.warn("UNAUTHORIZED ACCESS DETECTED: LOGGING OUT.");
        showToast("UNAUTHORIZED AGENT DETECTED. CLEARING SYSTEM.");
        await signOut(auth);
        showView("home");
      }
    } else {
      console.log("UNAUTHENTICATED");
      const sections = document.querySelectorAll("section");
      sections.forEach((s) => {
        if (s.id === "admin" && s.style.display === "block") {
          showView("home");
        }
      });
    }
  });

  // Preload default categories
  const ensureDefaultCategories = async () => {
    const defaults = [
      "Hoodie",
      "T-Shirt",
      "Pants",
      "Jacket",
      "Shoes",
      "Accessories",
    ];
    const existingNames = state.categories.map((c) => c.name);

    for (const defaultName of defaults) {
      if (!existingNames.includes(defaultName)) {
        try {
          await DB.addCategory({
            name: defaultName,
            createdAt: serverTimestamp(),
          });
          console.log(`[SYSTEM] DEFAULT CATEGORY CREATED: ${defaultName}`);
        } catch (error) {
          console.error(
            `[SYSTEM] FAILED TO CREATE DEFAULT CATEGORY: ${defaultName}`,
            error,
          );
        }
      }
    }
  };

  // STARTING FIREBASE REALTIME LISTENERS
  const startListeners = () => {
    console.log("[SYSTEM] SYNCHRONIZING REALTIME STREAMS...");

    // Clear existing listeners to prevent leaks/duplicates
    if (activeListeners.products) activeListeners.products();
    if (activeListeners.orders) activeListeners.orders();
    if (activeListeners.logs) activeListeners.logs();
    if (activeListeners.trash) activeListeners.trash();
    if (activeListeners.reviews) activeListeners.reviews();

    // Products Listener (Public)
    activeListeners.products = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        state.products = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        renderStore();
        if (Firewall.isAdmin()) renderAdmin();
      },
      (err) => {
        console.warn("[SYSTEM] PRODUCTS_LISTENER_ERR:", err.message);
        handleFirestoreError(err, OperationType.LIST, "products");
      },
    );

    // Orders Listener (Admin Only)
    if (Firewall.isAdmin()) {
      const ordersRef = collection(db, "orders");
      const ordersQuery = query(ordersRef, orderBy("createdAt", "desc"));

      activeListeners.orders = onSnapshot(
        ordersQuery,
        (snapshot) => {
          console.log("[SYSTEM] ORDERS_SYNC_RECEIVED:", snapshot.docs.length);

          state.orders = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          console.log("[SYSTEM] STATE_ORDERS_UPDATED:", state.orders.length);
          renderAdminOrders();
        },
        (err) => {
          console.error(
            "[SYSTEM] ORDERS_LISTENER_CRITICAL_ERROR:",
            err.message,
          );
          handleFirestoreError(err, OperationType.LIST, "orders");
        },
      );
    } else {
      activeListeners.orders = null;
    }

    // Logs Listener (Admin Only)
    if (Firewall.isAdmin()) {
      activeListeners.logs = onSnapshot(
        collection(db, "logs"),
        (snapshot) => {
          state.logs = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
          renderLogs();
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, "logs");
        },
      );
    } else {
      activeListeners.logs = null;
    }

    // Trash Listener (Admin Only)
    if (Firewall.isAdmin()) {
      activeListeners.trash = onSnapshot(
        collection(db, "trash"),
        (snapshot) => {
          state.trash = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
          renderTrash();
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, "trash");
        },
      );
    } else {
      activeListeners.trash = null;
    }

    // Reviews Listener (Mixed - Admin can see all, Public see published)
    const reviewsRef = collection(db, "reviews");
    const reviewsQuery = query(reviewsRef, orderBy("createdAt", "desc"));

    activeListeners.reviews = onSnapshot(
      reviewsQuery,
      (snapshot) => {
        state.reviews = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        renderPublicReviews();
        if (Firewall.isAdmin()) renderAdminReviews();
      },
      (err) => {
        console.warn("[SYSTEM] REVIEWS_LISTENER_ERR:", err.message);
        handleFirestoreError(err, OperationType.LIST, "reviews");
      },
    );

    // Categories Listener
    activeListeners.categories = onSnapshot(
      collection(db, "categories"),
      (snapshot) => {
        state.categories = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        }));
        renderCategoryOptions();
        renderCategoryFilterBar();
        renderStore();
        populateMobileCategories(); // ← Ensure mobile filter updates with live categories
        if (Firewall.isAdmin()) {
          renderAdminCategories();
          // After first load of categories, ensure defaults exist
          if (state.categories.length === 0) {
            ensureDefaultCategories();
          }
        }
      },
      (err) => {
        console.warn("[SYSTEM] CATEGORIES_LISTENER_ERR:", err.message);
        handleFirestoreError(err, OperationType.LIST, "categories");
      },
    );
  };

  const mobileMenu = document.getElementById("mobile-menu");
  const mobileToggle = document.getElementById("mobile-toggle");
  const menuClose = document.getElementById("menu-close");

  const toggleMobileMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.classList.toggle("active");
    document.body.style.overflow = mobileMenu.classList.contains("active")
      ? "hidden"
      : "auto";
  };

  if (mobileToggle) mobileToggle.addEventListener("click", toggleMobileMenu);
  if (menuClose) menuClose.addEventListener("click", toggleMobileMenu);

  // Admin Sidebar Toggle Logic
  const adminSidebar = document.getElementById("admin-sidebar");
  const adminSidebarToggle = document.getElementById("admin-sidebar-toggle");
  const adminSidebarClose = document.getElementById("admin-sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  const toggleAdminSidebar = () => {
    if (!adminSidebar) return;
    adminSidebar.classList.toggle("active");
    if (sidebarOverlay) sidebarOverlay.classList.toggle("active");
    document.body.style.overflow = adminSidebar.classList.contains("active")
      ? "hidden"
      : "auto";
  };

  if (adminSidebarToggle)
    adminSidebarToggle.addEventListener("click", toggleAdminSidebar);
  if (adminSidebarClose)
    adminSidebarClose.addEventListener("click", toggleAdminSidebar);
  if (sidebarOverlay)
    sidebarOverlay.addEventListener("click", toggleAdminSidebar);

  // Expandable Navbar Search
  const searchIconBtn = document.querySelector(".search-icon-btn");
  const searchInputWrapper = document.querySelector(".search-input-wrapper");
  const navbarSearchInput = document.querySelector(".navbar-search-input");
  const navbarSearch = document.querySelector(".navbar-search");

  if (searchIconBtn && searchInputWrapper && navbarSearchInput) {
    const setSearchExpanded = (expanded) => {
      searchInputWrapper.classList.toggle("active", expanded);
      searchIconBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (expanded) {
        navbarSearchInput.focus();
      }
    };

    const toggleSearch = () => {
      setSearchExpanded(!searchInputWrapper.classList.contains("active"));
    };

    // Click on search icon to toggle
    searchIconBtn.addEventListener("click", toggleSearch);

    // Close search on ESC key and submit on Enter
    navbarSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        setSearchExpanded(false);
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const query = String(navbarSearchInput.value || "").trim();
        updateSearchQuery(query);
        navigateToShopWithSearch(query);
        setSearchExpanded(false);
      }
    });

    // Close search when clicking outside
    document.addEventListener("click", (e) => {
      if (
        searchInputWrapper.classList.contains("active") &&
        navbarSearch &&
        !navbarSearch.contains(e.target)
      ) {
        setSearchExpanded(false);
      }
    });
  }

  const showView = (viewKey) => {
    // Firewall Check: Redirect if unauthorized
    if (!Firewall.guard(viewKey)) return;

    const nav = document.querySelector(".nav");
    if (viewKey === "admin") {
      if (nav) nav.style.display = "none";
    } else {
      if (nav) nav.style.display = "flex";
    }

    if (mobileMenu && mobileMenu.classList.contains("active"))
      toggleMobileMenu();

    document.querySelectorAll("section, footer").forEach((el) => {
      el.style.display = "none";
      el.classList.remove("active");
    });

    const toShow = sections[viewKey] || sections.home;
    toShow.forEach((id) => {
      const el =
        document.getElementById(id) || document.querySelector(`.${id}`);
      if (el) {
        el.style.display = "block";
        setTimeout(() => el.classList.add("active"), 50);
      }
    });

    if (viewKey !== "admin") {
      const foot = document.querySelector(".footer");
      if (foot) foot.style.display = "block";
    }

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("viewChanged"));

    if (viewKey === "shop" || viewKey === "home") renderStore();
    if (viewKey === "shop") {
      if (typeof renderShopControls === "function") renderShopControls();
    }
    if (viewKey === "home" || viewKey === "reviews") renderPublicReviews();
    if (viewKey === "wishlist") {
      renderWishlist();
    }
    if (viewKey === "admin") {
      renderAdmin();
      renderLogs();
      renderTrash();
      renderAdminReviews();
    }
    syncWishlistUI();
  };

  // 2.1 ADMIN AUTH
  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("[LOGIN_FORM_SUBMITTED]");
      console.log("[LOGIN_ATTEMPT]");

      const emailInput = document.getElementById("admin-email");
      const passwordInput = document.getElementById("admin-password");

      if (!emailInput || !passwordInput) {
        console.error("[LOGIN_ERROR] FORM INPUTS NOT FOUND");
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showToast("EMAIL AND PASSWORD REQUIRED");
        return;
      }

      try {
        const success = await Firewall.initiateSession(email, password);
        if (success) {
          console.log("[LOGIN_SUCCESS]");
        }
      } catch (error) {
        console.error("[LOGIN_ERROR]", error);
        showToast("LOGIN FAILED");
      }
    });
  }

  // 3. RENDER STORE PRODUCTS
  const getCategoryLabel = (categoryId, fallbackName) => {
    if (!categoryId) return "Uncategorized";
    const category = state.categories.find((c) => c.id === categoryId);
    return category?.name || fallbackName || "Uncategorized";
  };

  const renderStore = () => {
    const products = state.products;
    const mainGrid = document.getElementById("products-grid");
    const featuredGrid = document.querySelector("#featured .product-grid");

    const normalizedQuery = String(searchQuery || "").toLowerCase();

    const filteredProducts = products.filter((p) => {
      const matchesCategory =
        selectedProductCategory === "all" ||
        p.categoryId === selectedProductCategory;

      const productName = String(p.name || "").toLowerCase();
      const categoryName = String(
        getCategoryLabel(p.categoryId, p.category),
      ).toLowerCase();
      const matchesSearch =
        normalizedQuery === "" ||
        productName.includes(normalizedQuery) ||
        categoryName.includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });

    const isListView = shopViewMode === "list";

    const productToHTML = (p) => {
      if (isListView) {
        return `
            <div class="product-card" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.img}">
              <div class="product-image-container">
                <img src="${p.img}" alt="${p.name}" class="product-image" loading="lazy" decoding="async">
                <button class="wishlist-btn" data-id="${p.id}" title="Add to Wishlist">
                  <i class="far fa-heart"></i>
                </button>
              </div>
              <div class="product-info">
                <div class="product-info-left">
                  <div class="product-brand">${getCategoryLabel(p.categoryId, p.category) || "3DRIP"}</div>
                  <div class="product-name">${p.name}</div>
                  <div class="product-category-pill">${getCategoryLabel(p.categoryId, p.category) || "Essential"}</div>
                  <div class="product-desc">Premium quality streetwear essential from the 3DRIP collection.</div>
                </div>
                <div class="product-info-center">
                  <div class="product-price">${p.price.toLocaleString()} DA</div>
                  <div class="product-price-label">Algerian Dinar</div>
                </div>
                <div class="product-actions">
                  <button class="add-to-cart-btn" data-id="${p.id}">
                    <i class="fas fa-shopping-cart"></i>
                    Add to Cart
                  </button>
                </div>
              </div>
            </div>
          `;
      }
      return `
            <div class="product-card" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.img}">
              <div class="product-image-container">
                <img src="${p.img}" alt="${p.name}" class="product-image" loading="lazy" decoding="async">
                <button class="wishlist-btn" data-id="${p.id}" title="Add to Wishlist">
                  <i class="far fa-heart"></i>
                </button>
              </div>
              <div class="product-info">
                <div class="product-brand">${getCategoryLabel(p.categoryId, p.category) || "3DRIP"}</div>
                <div class="product-name">${p.name}</div>
                <div class="product-price">${p.price.toLocaleString()} DZD</div>
                <div class="product-card-btns">
                  <button class="add-to-cart-btn" data-id="${p.id}">
                    <i class="fas fa-shopping-cart"></i> Add to Cart
                  </button>
                  <button class="card-buy-now-btn" data-id="${p.id}">
                    <i class="fa-solid fa-bolt"></i> Buy Now
                  </button>
                </div>
              </div>
            </div>
          `;
    };

    // Apply sorting
    let sortedProducts = filteredProducts.slice();
    switch (shopSortBy) {
      case "price-asc":
        sortedProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "price-desc":
        sortedProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case "newest":
        sortedProducts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      case "best-selling":
        sortedProducts.sort((a, b) => (b.sold || 0) - (a.sold || 0));
        break;
      default:
        // featured or unknown: keep original order
        break;
    }

    if (mainGrid) {
      // Set view mode class
      mainGrid.classList.toggle("list-view", shopViewMode === "list");
      mainGrid.innerHTML =
        sortedProducts.length > 0
          ? sortedProducts.map(productToHTML).join("")
          : '<p class="empty-msg">NO PRODUCTS FOUND FOR THIS CATEGORY.</p>';
    }

    if (featuredGrid)
      featuredGrid.innerHTML = products.slice(0, 3).map(productToHTML).join("");
  };

  let selectedProductCategory = "all";
  let searchQuery = "";
  let shopSortBy = "featured";
  let shopViewMode = "grid";
  let homeSearchDraft = "";

  const escapeInputValue = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const updateSearchQuery = (value) => {
    searchQuery = String(value || "").trim();
    const homeInput = document.getElementById("home-search-input");
    if (homeInput) homeInput.value = searchQuery;
    const navbarSearchInput = document.querySelector(".navbar-search-input");
    if (navbarSearchInput && navbarSearchInput.value !== searchQuery)
      navbarSearchInput.value = searchQuery;
    renderCategoryFilterBar();
    renderStore();
  };

  // Render and wire the top shop controls (search, sort, view)
  const renderShopControls = () => {
    const topSearch = document.getElementById("shop-search-input");
    const sortSelect = document.getElementById("sort-select");
    const viewBtns = document.querySelectorAll(".view-toggle .view-btn");

    if (topSearch && !window.__shopTopSearchListenerAdded) {
      let searchTimeout;
      topSearch.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        const q = String(e.target.value || "").trim();
        searchTimeout = setTimeout(() => {
          updateSearchQuery(q);
        }, 200);
      });
      window.__shopTopSearchListenerAdded = true;
    }

    if (sortSelect && !window.__shopSortListenerAdded) {
      sortSelect.value = shopSortBy || "featured";
      sortSelect.addEventListener("change", (e) => {
        shopSortBy = e.target.value;
        renderStore();
      });
      window.__shopSortListenerAdded = true;
    }

    if (viewBtns && !window.__shopViewListenerAdded) {
      viewBtns.forEach((btn) =>
        btn.addEventListener("click", (e) => {
          const v = btn.dataset.view || "grid";
          shopViewMode = v;
          document.querySelectorAll(".view-toggle .view-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.view === v);
            b.setAttribute(
              "aria-pressed",
              b.dataset.view === v ? "true" : "false",
            );
          });
          renderStore();
        }),
      );
      window.__shopViewListenerAdded = true;
    }
  };

  const parseHash = (hash) => {
    const cleanHash = String(hash || window.location.hash || "#home").replace(
      /^#/,
      "",
    );
    const [viewName, queryString] = cleanHash.split("?");
    const params = new URLSearchParams(queryString || "");
    return {
      view: viewName || "home",
      search: params.get("search") || "",
    };
  };

  const navigateToShopWithSearch = (rawQuery) => {
    const query = String(rawQuery || "").trim();
    const hash = query ? `#shop?search=${encodeURIComponent(query)}` : "#shop";
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    handleHashNavigation();
  };

  const handleHashNavigation = () => {
    const cleanHash = String(window.location.hash || "#home").replace(/^#/, "");
    
    // Check for product route: product/PRODUCT_ID
    const productMatch = cleanHash.match(/^product\/(.+)$/);
    if (productMatch) {
      const productId = productMatch[1];
      showView("product");
      renderProductPage(productId);
      return;
    }

    const { view, search } = parseHash(window.location.hash);
    if (search) {
      updateSearchQuery(search);
      if (view === "shop") {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#shop",
        );
      } else {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#home",
        );
      }
    }

    const path = window.location.pathname.replace(/\/$/, "");
    const isReviewsPath = path.endsWith("/reviews");
    const isShopPath = path.endsWith("/shop");
    const isCartPath = path.endsWith("/cart");
    const isAdminPath = path.endsWith("/admin");

    if (!window.location.hash || window.location.hash === "#") {
      if (isReviewsPath) {
        showView("reviews");
        return;
      }
      if (isShopPath) {
        showView("shop");
        return;
      }
      if (isCartPath) {
        showView("cart");
        renderCart();
        return;
      }
      if (isAdminPath) {
        showView("admin");
        return;
      }
    }

    if (view === "shop") {
      showView("shop");
      return;
    }

    if (view === "reviews") {
      showView("reviews");
      return;
    }

    if (view === "cart") {
      showView("cart");
      renderCart();
      return;
    }

    if (view === "wishlist") {
      showView("wishlist");
      return;
    }

    showView("home");
  };

  const getCategoryNames = () => {
    const categoryNames = state.categories
      .filter((cat) => cat && cat.name)
      .map((cat) => cat.name)
      .sort((a, b) => a.localeCompare(b));

    // Also ensure Uncategorized is always available
    if (!categoryNames.includes("Uncategorized")) {
      categoryNames.push("Uncategorized");
    }

    return categoryNames;
  };

  const getCategoryFilterItems = () => {
    const categories = state.categories || [];
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    return [
      { id: "all", name: "All" },
      ...sorted.map((c) => ({ id: c.id, name: c.name })),
    ];
  };

  const renderCategoryFilterBar = () => {
    const filterBar = document.getElementById("product-filter-bar");
    if (!filterBar) return;

    const items = getCategoryFilterItems();
    const hasExistingPanel = Boolean(filterBar.querySelector(".filter-panel"));

    if (!hasExistingPanel) {
      filterBar.innerHTML = `
        <div class="filter-panel">
          <div class="filter-panel-header">
            <div>
              <span class="filter-panel-tag">FILTERS</span>
              <h3>Refine your search</h3>
            </div>
            <button type="button" class="sidebar-close-btn" aria-label="Close filters">&times;</button>
          </div>
          <div class="filter-section">
            <h4>Categories</h4>
            <div class="filter-items"></div>
          </div>
        </div>
      `;

      if (!document.querySelector(".sidebar-toggle-btn")) {
        filterBar.insertAdjacentHTML(
          "beforebegin",
          `<button type="button" class="sidebar-toggle-btn" aria-controls="product-filter-bar" aria-expanded="false"><i class="fa-solid fa-filter"></i> Filters</button>`,
        );
      }
    }

    const sidebarToggle = document.querySelector(".sidebar-toggle-btn");
    const sidebarClose = filterBar.querySelector(".sidebar-close-btn");
    const filterItemsContainer = filterBar.querySelector(".filter-items");

    if (!sidebarToggle || !sidebarClose || !filterItemsContainer) return;

    const openSidebar = () => {
      document.body.classList.add("shop-sidebar-open");
      sidebarToggle.setAttribute("aria-expanded", "true");
    };

    const closeSidebar = () => {
      document.body.classList.remove("shop-sidebar-open");
      sidebarToggle.setAttribute("aria-expanded", "false");
    };

    if (!window.__shopSidebarToggleListenersAdded) {
      sidebarToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        document.body.classList.toggle("shop-sidebar-open");
        sidebarToggle.setAttribute(
          "aria-expanded",
          document.body.classList.contains("shop-sidebar-open")
            ? "true"
            : "false",
        );
      });

      sidebarClose.addEventListener("click", (e) => {
        e.stopPropagation();
        closeSidebar();
      });

      window.addEventListener("click", (e) => {
        const sidebar = document.getElementById("product-filter-bar");
        if (!sidebar) return;
        if (
          document.body.classList.contains("shop-sidebar-open") &&
          !sidebar.contains(e.target) &&
          !sidebarToggle.contains(e.target)
        ) {
          closeSidebar();
        }
      });

      window.__shopSidebarToggleListenersAdded = true;
    }

    filterItemsContainer.innerHTML = items
      .map(
        (item) =>
          `<button type="button" class="filter-item ${
            selectedProductCategory === item.id ? "active" : ""
          }" data-category-id="${item.id}">${item.name}</button>`,
      )
      .join("");

    filterItemsContainer
      .querySelectorAll("button[data-category-id]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.categoryId;
          updateSelectedProductCategory(id);
          closeSidebar();
        });
      });
  };

  const updateSelectedProductCategory = (categoryId) => {
    if (!categoryId) return;
    selectedProductCategory = categoryId;
    renderCategoryFilterBar();
    renderStore();
  };

  const submitHomeSearch = () => {
    const homeInput = document.getElementById("home-search-input");
    const query = homeInput ? String(homeInput.value || "").trim() : "";
    homeSearchDraft = query;
    navigateToShopWithSearch(query);
  };

  const homeSearchInput = document.getElementById("home-search-input");
  const homeSearchButton = document.getElementById("home-search-submit");
  if (homeSearchInput) {
    homeSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitHomeSearch();
      }
    });
  }
  if (homeSearchButton) {
    homeSearchButton.addEventListener("click", submitHomeSearch);
  }

  const renderCategoryOptions = (selectedCategoryId = "") => {
    const categorySelect = document.getElementById("p-category");
    if (!categorySelect) return;

    const options = state.categories
      .map(
        (cat) =>
          `<option value="${cat.id}" data-name="${cat.name}">${cat.name}</option>`,
      )
      .concat([
        '<option value="uncategorized" data-name="Uncategorized">Uncategorized</option>',
      ])
      .join("");

    categorySelect.innerHTML = options;

    if (
      selectedCategoryId &&
      categorySelect.querySelector(`option[value="${selectedCategoryId}"]`)
    ) {
      categorySelect.value = selectedCategoryId;
    } else {
      categorySelect.value = categorySelect.options.length
        ? categorySelect.options[0].value
        : "uncategorized";
    }
  };

  const renderAdminCategories = () => {
    if (!Firewall.isAdmin()) return;
    const categories = [...state.categories].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const categoryList = document.getElementById("admin-category-list");
    if (!categoryList) return;

    if (categories.length === 0) {
      categoryList.innerHTML =
        '<tr><td colspan="4" style="text-align:center; opacity: 0.5; padding: 2rem;">NO CATEGORIES CONFIGURED. ADD ONE TO START.</td></tr>';
      return;
    }

    categoryList.innerHTML = categories
      .map((cat) => {
        const productCount = state.products.filter(
          (p) => p.categoryId === cat.id || p.category === cat.name,
        ).length;
        const createdAt = cat.createdAt
          ? new Date(cat.createdAt).toLocaleDateString()
          : "N/A";

        return `
                <tr class="admin-row-trigger" onclick="openCategoryDetail('${cat.id}')">
                    <td><strong style="color:#fff;">${cat.name}</strong></td>
                    <td class="desktop-only">${productCount}</td>
                    <td>${createdAt}</td>
                    <td>
                        <button class="action-btn" onclick="event.stopPropagation(); openCategoryDetail('${cat.id}')">VIEW</button>
                        <button class="action-btn delete-btn" onclick="event.stopPropagation(); confirmDeleteCategory('${cat.id}')">DELETE</button>
                    </td>
                </tr>
            `;
      })
      .join("");
  };

  let categoryToDeleteId = null;

  window.openCategoryDetail = (categoryId) => {
    if (!Firewall.isAdmin()) return;
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;

    const modal = document.getElementById("category-detail-modal");
    const meta = document.getElementById("category-detail-meta");
    const body = document.getElementById("category-detail-products");
    if (!modal || !meta || !body) return;

    const products = state.products.filter(
      (p) => p.categoryId === category.id || p.category === category.name,
    );
    meta.textContent = `${products.length} product${products.length === 1 ? "" : "s"} assigned`;

    if (products.length === 0) {
      body.innerHTML =
        '<p style="opacity: 0.6; padding: 2rem; text-align: center;">NO PRODUCTS ARE CURRENTLY ASSIGNED TO THIS CATEGORY.</p>';
    } else {
      body.innerHTML = products
        .map(
          (prod) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
                    <div style="display:flex;gap:1rem;align-items:center;">
                        <img src="${prod.img}" alt="${prod.name}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">
                        <div>
                            <strong>${prod.name}</strong>
                            <div style="font-size:0.75rem;opacity:0.65;">${prod.price.toLocaleString()} DZD</div>
                        </div>
                    </div>
                    <button class="btn btn-mini" style="min-width: 110px;" onclick="event.stopPropagation(); openEditProduct('${prod.id}'); document.getElementById('category-detail-modal').classList.remove('active');">EDIT</button>
                </div>
            `,
        )
        .join("");
    }

    modal.classList.add("active");
  };

  window.confirmDeleteCategory = (categoryId) => {
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;

    const productCount = state.products.filter(
      (p) => p.categoryId === category.id || p.category === category.name,
    ).length;
    if (productCount > 0) {
      showToast(
        "CANNOT DELETE CATEGORY: PRODUCTS ARE STILL ASSIGNED. RECATEGORIZE FIRST.",
      );
      return;
    }

    categoryToDeleteId = categoryId;
    const msg = document.getElementById("delete-category-message");
    if (msg)
      msg.textContent = `Delete category “${category.name}”? This cannot be undone.`;
    document.getElementById("delete-category-modal").classList.add("active");
  };

  const confirmDeleteCategoryBtn = document.getElementById(
    "confirm-delete-category-btn",
  );
  if (confirmDeleteCategoryBtn) {
    confirmDeleteCategoryBtn.addEventListener("click", async () => {
      if (!categoryToDeleteId) return;
      confirmDeleteCategoryBtn.disabled = true;
      const originalText = confirmDeleteCategoryBtn.innerHTML;
      confirmDeleteCategoryBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> DELETING...';

      try {
        await DB.deleteCategory(categoryToDeleteId);
        showToast("CATEGORY REMOVED.");
        document
          .getElementById("delete-category-modal")
          .classList.remove("active");
        categoryToDeleteId = null;
      } catch (error) {
        console.error("CATEGORY DELETE ERROR:", error);
        showToast("FAILED TO DELETE CATEGORY.");
      } finally {
        confirmDeleteCategoryBtn.disabled = false;
        confirmDeleteCategoryBtn.innerHTML = originalText;
      }
    });
  }

  const categoryForm = document.getElementById("category-form");
  if (categoryForm) {
    categoryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!Firewall.isAdmin()) return;

      const nameInput = document.getElementById("category-name");
      if (!nameInput) return;

      const name = nameInput.value.trim();

      if (!name) {
        return showToast("CATEGORY NAME IS REQUIRED.");
      }

      const duplicate = state.categories.some(
        (cat) => cat.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        return showToast("A CATEGORY WITH THIS NAME ALREADY EXISTS.");
      }

      try {
        await DB.addCategory({
          name,
          createdAt: serverTimestamp(),
        });
        showToast("CATEGORY CREATED.");
        categoryForm.reset();
      } catch (error) {
        console.error("CATEGORY CREATE ERROR:", error);
        showToast("FAILED TO CREATE CATEGORY.");
      }
    });
  }

  // 4. CART SYSTEM
  let cart = JSON.parse(localStorage.getItem("3drip_cart") || "[]");
  const cartBadge = document.querySelector(".cart-count");
  const cartBadgeMobile = document.querySelector(".cart-count-mobile");
  const cartItemsList = document.getElementById("cart-items-list");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl = document.getElementById("total-price");
  let viewingCart = false;

  // Save cart to localStorage
  const saveCart = () => {
    localStorage.setItem("3drip_cart", JSON.stringify(cart));
  };

  // Unified add to cart function
  const addToCart = (product, quantity = 1) => {
    const cartItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      img: product.img,
      quantity: quantity,
    };
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + quantity;
    } else {
      cart.push(cartItem);
    }
    saveCart();
    updateCartUI();
    return existing ? existing : cartItem;
  };

  const updateCartUI = () => {
    const totalQuantity = cart.reduce(
      (acc, item) => acc + (item.quantity || 1),
      0,
    );
    if (cartBadge) cartBadge.textContent = totalQuantity;
    if (cartBadgeMobile) cartBadgeMobile.textContent = totalQuantity;
    if (cartBadge) {
      cartBadge.style.transform = "scale(1.5)";
      setTimeout(() => (cartBadge.style.transform = "scale(1)"), 200);
    }
    if (viewingCart) renderCart();
  };

  const renderCart = () => {
    if (!cartItemsList) return;
    if (cart.length === 0) {
      cartItemsList.innerHTML =
        '<p class="empty-msg">YOUR BAG IS EMPTY. START EXPLORING.</p>';
      if (subtotalEl) subtotalEl.textContent = "0 DZD";
      if (totalEl) totalEl.textContent = "500 DZD";
      return;
    }
    let subtotal = 0;
    cartItemsList.innerHTML = "";
    cart.forEach((item, index) => {
      const itemQty = item.quantity || 1;
      subtotal += item.price * itemQty;
      cartItemsList.insertAdjacentHTML(
        "beforeend",
        `
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
            `,
      );
    });
    if (subtotalEl) subtotalEl.textContent = `${subtotal.toLocaleString()} DZD`;
    if (totalEl)
      totalEl.textContent = `${(subtotal + 500).toLocaleString()} DZD`;
  };

  if (cartItemsList) {
    cartItemsList.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".remove-btn");
      const qtyBtn = e.target.closest(".qty-btn");

      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index, 10);
        const cartItemEl = removeBtn.closest(".cart-item");
        if (cartItemEl) {
          cartItemEl.classList.add("removing");
          cartItemEl.style.pointerEvents = "none";
        }
        setTimeout(() => {
          if (Number.isFinite(idx) && idx >= 0 && idx < cart.length) {
            cart.splice(idx, 1);
            saveCart();
            updateCartUI();
          }
        }, 320);
      } else if (qtyBtn) {
        const idx = parseInt(qtyBtn.dataset.index, 10);
        const delta = parseInt(qtyBtn.dataset.delta, 10);
        if (!Number.isFinite(idx) || !Number.isFinite(delta)) return;
        const currentQty = cart[idx].quantity || 1;
        cart[idx].quantity = currentQty + delta;
        if (cart[idx].quantity < 1) cart[idx].quantity = 1;
        saveCart();
        updateCartUI();
      }
    });
  }

  // Initialize cart UI on page load to display persisted cart count
  updateCartUI();

  // ============ WISHLIST SYSTEM ============
  let wishlist = JSON.parse(localStorage.getItem("3drip_wishlist") || "[]");

  const saveWishlist = () => {
    localStorage.setItem("3drip_wishlist", JSON.stringify(wishlist));
    const badge = document.getElementById("wishlist-badge");
    if (badge) badge.textContent = wishlist.length;
    syncWishlistUI();
    // Re-render wishlist page if currently viewing it
    const wishlistSection = document.getElementById("wishlist");
    if (wishlistSection && wishlistSection.style.display !== "none") {
      renderWishlist();
    }
  };

  const isInWishlist = (productId) =>
    wishlist.some((item) => item.id === productId);

  const toggleWishlist = (product) => {
    const idx = wishlist.findIndex((item) => item.id === product.id);
    if (idx > -1) {
      wishlist.splice(idx, 1);
      showToast("Removed from Wishlist");
    } else {
      wishlist.push({
        id: product.id,
        name: product.name,
        price: product.price,
        img: product.img,
        category: product.category,
      });
      showToast("Added to Wishlist ❤️");
    }
    saveWishlist();
  };

  const syncWishlistUI = () => {
    document.querySelectorAll(".wishlist-btn").forEach((btn) => {
      const id = btn.dataset.id;
      const icon = btn.querySelector("i");
      if (isInWishlist(id)) {
        btn.classList.add("active");
        if (icon) {
          icon.classList.remove("far");
          icon.classList.add("fas");
        }
      } else {
        btn.classList.remove("active");
        if (icon) {
          icon.classList.remove("fas");
          icon.classList.add("far");
        }
      }
    });
  };

  // Delegate wishlist button clicks (for both grid/list views)
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".wishlist-btn");
    if (btn) {
      e.preventDefault();
      const card = btn.closest(".product-card");
      if (!card) return;
      const product = {
        id: card.dataset.id,
        name: card.dataset.name,
        price: parseInt(card.dataset.price),
        img: card.dataset.img,
        category: card.dataset.category || "",
      };
      toggleWishlist(product);
      btn.classList.add("animate");
      setTimeout(() => btn.classList.remove("animate"), 400);
      return;
    }
  });

  const renderWishlist = () => {
    const grid = document.getElementById("wishlist-grid");
    const empty = document.getElementById("wishlist-empty");
    if (!grid || !empty) return;

    if (wishlist.length === 0) {
      grid.innerHTML = "";
      empty.classList.add("show");
      return;
    }
    empty.classList.remove("show");
    grid.innerHTML = wishlist
      .map(
        (item) => `
        <div class="product-card" data-id="${item.id}" data-name="${item.name}" data-price="${item.price || 0}" data-img="${item.img}">
          <div class="product-image-container">
            <img src="${item.img}" alt="${item.name}" class="product-image" loading="lazy" decoding="async">
            <button class="wishlist-btn active" data-id="${item.id}" title="Remove from Wishlist">
              <i class="fas fa-heart"></i>
            </button>
          </div>
          <div class="product-info">
            <div class="product-brand">${item.category || "3DRIP"}</div>
            <div class="product-name">${item.name}</div>
            <div class="product-price">${(item.price || 0).toLocaleString()} DZD</div>
            <button class="add-to-cart-btn wishlist-add-cart" data-id="${item.id}">
              <i class="fas fa-shopping-cart"></i>
              Add to Cart
            </button>
          </div>
        </div>
      `,
      )
      .join("");
  };

  // Initialize wishlist badge on load
  const initWishlistBadge = () => {
    const badge = document.getElementById("wishlist-badge");
    if (badge) badge.textContent = wishlist.length;
  };
  initWishlistBadge();

  // Delegate Buy Now button clicks from product cards
  document.body.addEventListener("click", (e) => {
    // Handle both .buy-now-btn (product page) and .card-buy-now-btn (product cards)
    const buyNowBtn = e.target.closest(".buy-now-btn, .card-buy-now-btn");
    if (buyNowBtn) {
      e.preventDefault();
      const card = buyNowBtn.closest(".product-card") || buyNowBtn.closest("[data-id]");
      if (card) {
        const productId = card.dataset.id;
        // Navigate to product page via hash
        window.location.hash = `#product/${productId}`;
        handleHashNavigation();
      }
      return;
    }
  });

  // Unified Add to Cart handler - handles all button types
  document.body.addEventListener("click", (e) => {
    // Check for .add-to-cart-btn (product cards) or .add-to-cart (legacy)
    const addBtn = e.target.closest(".add-to-cart-btn, .add-to-cart");
    if (!addBtn) return;

    e.preventDefault();
    e.stopPropagation();

    // Get the product card
    const card = addBtn.closest(".product-card") || addBtn.closest("[data-id]");
    if (!card) {
      console.warn("[CART] No product card found for add to cart button");
      return;
    }

    // Extract product data from card attributes
    const product = {
      id: card.dataset.id,
      name: card.dataset.name,
      price: parseInt(card.dataset.price),
      img: card.dataset.img,
    };

    // Validate product data
    if (!product.id || !product.name || isNaN(product.price) || !product.img) {
      console.warn("[CART] Invalid product data:", product);
      showToast("ERROR: Invalid product data.");
      return;
    }

    // Add to cart
    addToCart(product, 1);
    showToast(`ADDED TO BAG: ${product.name}`);

    // Button feedback animation
    const btn = addBtn;
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    const originalColor = btn.style.color;
    btn.textContent = "ADDED!";
    btn.style.background = "white";
    btn.style.color = "black";
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = originalBg || "var(--accent)";
      btn.style.color = originalColor || "white";
      btn.disabled = false;
    }, 1000);
  });

  // 5. ADMIN PANEL LOGIC
  const renderAdmin = () => {
    if (!Firewall.isAdmin()) return;
    renderAdminProducts();
    renderAdminOrders();
    renderAdminCategories();
  };

  const renderAdminProducts = () => {
    if (!Firewall.isAdmin()) return;
    const products = state.products;
    const adminProductList = document.getElementById("admin-product-list");
    if (!adminProductList) return;

    if (products.length === 0) {
      adminProductList.innerHTML =
        '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">NO PRODUCTS IN DATABASE</td></tr>';
    } else {
      adminProductList.innerHTML = products
        .map(
          (p) => `
                <tr id="admin-row-${p.id}" class="admin-row-trigger" data-id="${p.id}" data-name="${p.name}">
                    <td><img src="${p.img}" class="admin-img-thumb" alt=""></td>
                    <td>${p.name}</td>
                    <td>${getCategoryLabel(p.categoryId, p.category)}</td>
                    <td>${p.price.toLocaleString()} DZD</td>
                    <td>
                        <div class="desktop-actions">
                            <button class="action-btn edit-btn" onclick="event.stopPropagation(); openEditProduct('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteProduct('${p.id}')"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `,
        )
        .join("");
    }
  };

  const renderAdminOrders = () => {
    if (!Firewall.isAdmin()) return;
    const orders = state.orders;
    const container = document.getElementById("orders-compact-container");
    const emptyState = document.getElementById("orders-empty-state");
    const countBadge = document.getElementById("orders-count-badge");

    if (countBadge) {
      countBadge.textContent = `${orders.length} ORDER${orders.length !== 1 ? 'S' : ''}`;
    }

    if (orders.length === 0) {
      if (container) container.innerHTML = "";
      if (container) container.style.display = "none";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (container) container.style.display = "flex";

    console.log("[SYSTEM] RENDERING_ADMIN_ORDERS:", orders.length);

    const ordersHTML = [...orders]
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      })
      .map((o, index) => {
        const totalItems = (o.items || []).reduce(
          (acc, item) => acc + (item.quantity || 1),
          0,
        );
        const formattedDate = o.createdAt
          ? new Date(o.createdAt).toLocaleDateString()
          : "N/A";
        const shortId = o.id ? o.id.slice(-6).toUpperCase() : "------";
        const statusLower = (o.status || "PENDING").toLowerCase();

        return `
          <div class="order-compact-card" id="order-card-${o.id}">
            <div class="order-compact-main" onclick="openOrderDetail('${o.id}')">
              <span class="order-index">#ORD-${shortId}</span>
              <div class="order-compact-info">
                <span class="order-compact-customer">${o.customer?.name || "UNKNOWN"}</span>
                <div class="order-compact-meta">
                  <span><i class="fa-solid fa-calendar"></i> ${formattedDate}</span>
                  <span><i class="fa-solid fa-box"></i> ${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div class="order-compact-total">${(o.total || 0).toLocaleString()} DZD</div>
              <div class="order-compact-status">
                <span class="status-badge status-${statusLower}">${o.status || "PENDING"}</span>
                <div class="order-compact-view-icon">
                  <i class="fa-solid fa-chevron-right"></i>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    if (container) container.innerHTML = ordersHTML;
    console.log("[SYSTEM] ADMIN_ORDERS_RENDER_COMPLETE");
  };

  window.openOrderDetail = (id) => {
    if (!Firewall.isAdmin()) return;

    const order = state.orders.find((o) => o.id === id);
    if (!order) return;

    const modal = document.getElementById("order-detail-modal");
    if (!modal) return;

    // Fill transaction ID
    document.getElementById("dt-order-id").textContent = `TRANS_ID: ${order.id}`;

    // Fill customer info
    document.getElementById("dt-customer-name").textContent =
      order.customer?.name || "N/A";
    const phoneEl = document.getElementById("dt-customer-phone");
    if (phoneEl) phoneEl.textContent = order.customer?.phone || "N/A";
    
    const locationEl = document.getElementById("dt-customer-location");
    if (locationEl) {
      const wilaya = order.customer?.wilaya || "";
      const city = order.customer?.city || "";
      locationEl.textContent = [wilaya, city].filter(Boolean).join(", ") || "N/A";
    }
    
    document.getElementById("dt-customer-address").textContent =
      order.customer?.address || "N/A";
    
    // Fill notes if they exist
    const notesWrapper = document.getElementById("dt-notes-wrapper");
    const notesEl = document.getElementById("dt-customer-notes");
    if (order.customer?.notes && notesWrapper && notesEl) {
      notesWrapper.style.display = "block";
      notesEl.textContent = order.customer.notes;
    } else if (notesWrapper) {
      notesWrapper.style.display = "none";
    }

    // Fill date
    document.getElementById("dt-order-date").textContent = order.createdAt
      ? new Date(order.createdAt).toLocaleString()
      : "N/A";
    
    // Fill total
    document.getElementById("dt-total-price").textContent =
      `${(order.total || 0).toLocaleString()} DZD`;

    // Fill status
    const statusEl = document.getElementById("dt-order-status");
    statusEl.textContent = order.status || "PENDING";
    statusEl.className = `status-badge status-${(order.status || "PENDING").toLowerCase()}`;

    // Fill items
    const itemsList = document.getElementById("dt-items-list");
    itemsList.innerHTML = (order.items || [])
      .map(
        (item) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${item.img}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                    <div>
                        <p style="font-size: 0.75rem; font-weight: 700;">${item.name}</p>
                        <p style="font-size: 0.6rem; opacity: 0.5;">${item.price.toLocaleString()} DZD</p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <p style="font-size: 0.8rem; font-weight: 700;">x${item.quantity || 1}</p>
                </div>
            </div>
        `,
      )
      .join("");

    // Fill status controls
    const statusControls = document.getElementById("order-status-controls");
    if (statusControls) {
      statusControls.innerHTML = `
        <button class="btn btn-mini" style="background: rgba(255, 230, 0, 0.15); color: #ffe600; border: 1px solid rgba(255, 230, 0, 0.3);" onclick="updateOrderStatusFromDetail('${order.id}', 'PENDING')">PENDING</button>
        <button class="btn btn-mini" style="background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.3);" onclick="updateOrderStatusFromDetail('${order.id}', 'PROCESSING')">PROCESSING</button>
        <button class="btn btn-mini" style="background: rgba(0, 255, 128, 0.15); color: #00ff80; border: 1px solid rgba(0, 255, 128, 0.3);" onclick="updateOrderStatusFromDetail('${order.id}', 'COMPLETED')">COMPLETED</button>
        <button class="btn btn-mini" style="background: rgba(255, 77, 77, 0.15); color: #ff4d4d; border: 1px solid rgba(255, 77, 77, 0.3);" onclick="updateOrderStatusFromDetail('${order.id}', 'CANCELLED')">CANCELLED</button>
      `;
    }

    // Wire up delete button
    const deleteBtn = document.getElementById("dt-delete-order-btn");
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (confirm("PERMANENTLY DELETE THIS ORDER?")) {
          try {
            await deleteDoc(doc(db, "orders", order.id));
            modal.classList.remove("active");
            showToast("ORDER PURGED FROM SYSTEM.");
          } catch (err) {
            console.error("DELETE ORDER ERROR:", err);
            showToast("FAILED TO DELETE ORDER.");
          }
        }
      };
    }

    modal.classList.add("active");
  };

  window.updateOrderStatusFromDetail = async (id, status) => {
    if (!Firewall.isAdmin()) return;
    await DB.updateOrderStatus(id, status);
    
    // Update UI locally
    const statusEl = document.getElementById("dt-order-status");
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = `status-badge status-${status.toLowerCase()}`;
    }
    
    showToast(`ORDER STATUS UPDATED: ${status}`);
  };

  const renderAdminReviews = () => {
    if (!Firewall.isAdmin()) return;
    const reviews = state.reviews;
    const adminReviewList = document.getElementById("admin-review-list");
    if (adminReviewList) {
      if (reviews.length === 0) {
        adminReviewList.innerHTML =
          '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">NO REVIEWS LOGGED.</td></tr>';
      } else {
        adminReviewList.innerHTML = [...reviews]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map(
            (r) => `
                    <tr class="review-row-trigger" 
                        data-id="${r.id}" 
                        data-name="${r.name}" 
                        data-rating="${r.rating || 0}" 
                        data-message="${r.message.replace(/"/g, "&quot;")}" 
                        data-best="${!!r.isBest}">
                        <td>
                            <strong>${r.name}</strong><br>
                            <small>${new Date(r.createdAt || 0).toLocaleDateString()}</small>
                        </td>
                        <td>
                            <div class="stars">
                                ${Array(5)
                                  .fill(0)
                                  .map(
                                    (_, i) =>
                                      `<i class="fa-solid fa-star" style="color: ${i < (r.rating || 0) ? "#ffcc00" : "rgba(255,255,255,0.1)"};"></i>`,
                                  )
                                  .join("")}
                            </div>
                        </td>
                        <td><p style="font-size: 0.75rem; max-width: 300px; white-space: normal;">${r.message}</p></td>
                        <td>
                            <select class="admin-select-status" onchange="updateReviewStatus('${r.id}', this.value)">
                                <option value="PENDING" ${r.status === "PENDING" ? "selected" : ""}>PENDING</option>
                                <option value="PUBLISHED" ${r.status === "PUBLISHED" ? "selected" : ""}>PUBLISHED</option>
                                <option value="REJECTED" ${r.status === "REJECTED" ? "selected" : ""}>REJECTED</option>
                            </select>
                        </td>
                        <td>
                            <button class="action-btn" onclick="event.stopPropagation(); toggleBestReview('${r.id}', ${!!r.isBest})" style="color: ${r.isBest ? "#ffcc00" : "rgba(255,255,255,0.2)"};">
                                <i class="fa-solid fa-star"></i>
                            </button>
                        </td>
                        <td>
                            <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteReview('${r.id}')"><i class="fa-solid fa-trash-can"></i></button>
                        </td>
                    </tr>
                `,
          )
          .join("");
      }
    }
  };

  window.toggleBestReview = async (id, current) => {
    if (!Firewall.isAdmin()) return;
    await DB.toggleBestReview(id, current);
    showToast(
      current ? "REMOVED FROM BEST REVIEWS." : "PROMOTED TO BEST REVIEWS.",
    );
  };

  window.updateReviewStatus = async (id, status) => {
    if (!Firewall.isAdmin()) return;
    await DB.updateReviewStatus(id, status);
    showToast(`REVIEW STATUS UPDATED: ${status}`);
  };

  window.deleteReview = async (id) => {
    if (!Firewall.isAdmin()) return;
    if (confirm("PERMANENTLY ERASE THIS TRANSMISSION FROM THE ARCHIVE?")) {
      await DB.deleteReview(id);
      showToast("REVIEW PURGED.");
    }
  };

  const renderPublicReviews = () => {
    const reviews = state.reviews.filter((r) => r.status === "PUBLISHED");
    const bestReviews = reviews.filter((r) => r.isBest === true);
    const publicList = document.getElementById("public-reviews-list");
    const testimonialTrack = document.querySelector(".testimonial-track");

    const reviewToHTML = (r) => `
            <div class="testimonial-card">
                <div class="testimonial-header">
                    ${
                      r.avatar
                        ? `<img src="${r.avatar}" alt="${r.name}" class="testimonial-avatar" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent);">`
                        : `<div class="testimonial-avatar" style="background: var(--accent); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 1.2rem; color: #000;">
                            ${r.name ? r.name.charAt(0).toUpperCase() : "?"}
                        </div>`
                    }
                    <div class="testimonial-meta">
                        <h4>${r.name || "ANONYMOUS"}</h4>
                        <div class="stars">
                            ${Array(5)
                              .fill(0)
                              .map(
                                (_, i) =>
                                  `<i class="fa-solid fa-star" style="color: ${i < (r.rating || 0) ? "#ffcc00" : "rgba(255,255,255,0.1)"};"></i>`,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
                <p class="testimonial-text">${r.message || ""}</p>
                <div class="testimonial-id">AGENT_LOG // ${r.id ? r.id.slice(-6).toUpperCase() : "UNKNOWN"}</div>
            </div>
        `;

    if (publicList) {
      if (reviews.length === 0) {
        publicList.innerHTML =
          '<p class="empty-msg">THE ARCHIVE IS CURRENTLY EMPTY. BE THE FIRST TO LOG YOUR FEEDBACK.</p>';
      } else {
        publicList.innerHTML = reviews.map(reviewToHTML).join("");
      }
    }

    if (testimonialTrack) {
      // Testimonial slider uses "Best Reviews" if any exist, otherwise fallback to all published
      const displayReviews = bestReviews.length > 0 ? bestReviews : reviews;

      if (displayReviews.length === 0) {
        testimonialTrack.innerHTML =
          '<div class="testimonial-group"><p style="padding: 2rem; opacity: 0.5;">INITIALIZING TESTIMONIAL FEED...</p></div>';
      } else {
        const reviewsHTML = displayReviews.map(reviewToHTML).join("");
        let repeatedReviewsHTML = reviewsHTML;
        // Double/Triple for smooth infinite loop
        if (displayReviews.length < 5)
          repeatedReviewsHTML = reviewsHTML + reviewsHTML + reviewsHTML;

        const groupHTML = `<div class="testimonial-group">${repeatedReviewsHTML}</div>`;
        testimonialTrack.innerHTML = groupHTML + groupHTML;
      }
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
    const logsList = document.getElementById("admin-log-list");
    if (logsList) {
      if (logs.length === 0) {
        logsList.innerHTML =
          '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">NO SYSTEM ACTIVITY LOGGED.</td></tr>';
      } else {
        try {
          logsList.innerHTML = [...logs]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .map(
              (log) => `
                        <tr>
                            <td>${log.productName || "SYSTEM"}</td>
                            <td>${(log.price || 0).toLocaleString()} DZD</td>
                            <td>${log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A"}</td>
                            <td><span class="status-badge status-${(log.status || "unknown").toLowerCase()}">${log.status || "LOG"}</span></td>
                            <td>${log.type || "EVENT"}</td>
                        </tr>
                    `,
            )
            .join("");
        } catch (err) {
          console.error("[SYSTEM] RENDER_LOGS_ERROR:", err);
          logsList.innerHTML =
            '<tr><td colspan="5" style="text-align:center; padding: 1rem; color: #ff4d4d;">SYNC ERROR: LOG INTEGRITY COMPROMISED.</td></tr>';
        }
      }
    }
  };

  window.promptDeleteAllLogs = () => {
    if (!Firewall.isAdmin()) return;
    if (state.logs.length === 0) return showToast("NO LOGS TO DELETE.");
    document.getElementById("delete-all-logs-modal").classList.add("active");
  };

  const confirmDeleteAllLogsBtn = document.getElementById(
    "confirm-delete-all-logs-btn",
  );
  if (confirmDeleteAllLogsBtn) {
    confirmDeleteAllLogsBtn.addEventListener("click", async () => {
      const originalText = confirmDeleteAllLogsBtn.innerHTML;
      confirmDeleteAllLogsBtn.disabled = true;
      confirmDeleteAllLogsBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> WIPING LOGS...';

      try {
        await DB.deleteAllLogs();
        showToast("SYSTEM ACTIVITY LOGS WIPED.");
        document
          .getElementById("delete-all-logs-modal")
          .classList.remove("active");
      } catch (error) {
        showToast("SYSTEM ERROR: LOG WIPE FAILED.");
      } finally {
        confirmDeleteAllLogsBtn.disabled = false;
        confirmDeleteAllLogsBtn.innerHTML = originalText;
      }
    });
  }

  const renderTrash = () => {
    if (!Firewall.isAdmin()) return;
    const trash = state.trash;
    const trashList = document.getElementById("admin-trash-list");
    if (trashList) {
      if (trash.length === 0) {
        trashList.innerHTML =
          '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">TRASH IS EMPTY. NOTHING TO RECOVER.</td></tr>';
      } else {
        trashList.innerHTML = [...trash]
          .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))
          .map(
            (p) => `
                    <tr id="trash-row-${p.id}" class="trash-row-trigger" data-id="${p.id}" data-name="${p.name}">
                        <td><img src="${p.img}" class="admin-img-thumb" alt=""></td>
                        <td>${p.name}</td>
                        <td>${p.price.toLocaleString()} DZD</td>
                        <td>${new Date(p.deletedAt).toLocaleDateString()}</td>
                        <td>
                            <div class="desktop-actions">
                                <button class="action-btn edit-btn" title="RESTORE" onclick="event.stopPropagation(); restoreProduct('${p.id}')"><i class="fa-solid fa-rotate-left"></i></button>
                                <button class="action-btn delete-btn" title="WIPE" onclick="event.stopPropagation(); permanentDelete('${p.id}')"><i class="fa-solid fa-skull"></i></button>
                            </div>
                        </td>
                    </tr>
                `,
          )
          .join("");
      }
    }
  };

  // Mobile Action Card Logic
  const productActionModal = document.getElementById("product-action-modal");
  const mProductName = document.getElementById("m-product-name");
  const mobileEditBtn = document.getElementById("mobile-edit-btn");
  const mobileDeleteBtn = document.getElementById("mobile-delete-btn");
  const productActionClose = document.getElementById("product-action-close");
  let currentMobileProductId = null;

  const adminProductList = document.getElementById("admin-product-list");
  if (adminProductList) {
    adminProductList.addEventListener("click", (e) => {
      if (window.innerWidth > 768) return;
      const row = e.target.closest(".admin-row-trigger");
      if (row) {
        currentMobileProductId = row.dataset.id;
        if (mProductName) mProductName.textContent = row.dataset.name;
        if (productActionModal) productActionModal.classList.add("active");
      }
    });
  }

  if (productActionClose)
    productActionClose.addEventListener("click", () =>
      productActionModal.classList.remove("active"),
    );

  if (mobileEditBtn) {
    mobileEditBtn.addEventListener("click", () => {
      if (currentMobileProductId) {
        window.openEditProduct(currentMobileProductId);
        productActionModal.classList.remove("active");
      }
    });
  }

  if (mobileDeleteBtn) {
    mobileDeleteBtn.addEventListener("click", () => {
      if (currentMobileProductId) {
        window.deleteProduct(currentMobileProductId);
        productActionModal.classList.remove("active");
      }
    });
  }

  const trashActionModal = document.getElementById("trash-action-modal");
  const trashItemTitle = document.getElementById("trash-item-title");
  const mobileRestoreBtn = document.getElementById("mobile-restore-btn");
  const mobilePermanentDeleteBtn = document.getElementById(
    "mobile-permanent-delete-btn",
  );
  const trashActionClose = document.getElementById("trash-action-close");
  let currentTrashId = null;

  const trashList = document.getElementById("admin-trash-list");
  if (trashList) {
    trashList.addEventListener("click", (e) => {
      if (window.innerWidth > 768) return;
      const row = e.target.closest(".trash-row-trigger");
      if (row) {
        currentTrashId = row.dataset.id;
        if (trashItemTitle) trashItemTitle.textContent = row.dataset.name;
        if (trashActionModal) trashActionModal.classList.add("active");
      }
    });
  }

  if (trashActionClose)
    trashActionClose.addEventListener("click", () =>
      trashActionModal.classList.remove("active"),
    );

  if (mobileRestoreBtn) {
    mobileRestoreBtn.addEventListener("click", () => {
      if (currentTrashId) {
        window.restoreProduct(currentTrashId);
        trashActionModal.classList.remove("active");
      }
    });
  }

  if (mobilePermanentDeleteBtn) {
    mobilePermanentDeleteBtn.addEventListener("click", () => {
      if (currentTrashId) {
        window.permanentDelete(currentTrashId);
        trashActionModal.classList.remove("active");
      }
    });
  }

  const reviewActionModal = document.getElementById("review-action-modal");
  const mobileReviewName = document.getElementById("m-reviewer-name");
  const mobileReviewStars = document.getElementById("m-review-stars");
  const mobileReviewMessage = document.getElementById("m-review-message");
  const mobileBestReviewBtn = document.getElementById("mobile-best-review-btn");
  const mobileDeleteReviewBtn = document.getElementById(
    "mobile-delete-review-btn",
  );
  const reviewActionClose = document.getElementById("review-action-close");
  let currentMobileReviewId = null;
  let currentMobileReviewBest = false;

  const adminReviewList = document.getElementById("admin-review-list");
  if (adminReviewList) {
    adminReviewList.addEventListener("click", (e) => {
      if (window.innerWidth > 900) return;
      const row = e.target.closest(".review-row-trigger");
      if (row) {
        currentMobileReviewId = row.dataset.id;
        currentMobileReviewBest = row.dataset.best === "true";

        if (mobileReviewName) mobileReviewName.textContent = row.dataset.name;
        if (mobileReviewMessage)
          mobileReviewMessage.innerHTML = row.dataset.message;

        if (mobileReviewStars) {
          const rating = parseInt(row.dataset.rating);
          mobileReviewStars.innerHTML = Array(5)
            .fill(0)
            .map(
              (_, i) =>
                `<i class="fa-solid fa-star" style="color: ${i < rating ? "#ffcc00" : "rgba(255,255,255,0.1)"};"></i>`,
            )
            .join("");
        }

        if (mobileBestReviewBtn) {
          mobileBestReviewBtn.style.background = currentMobileReviewBest
            ? "rgba(255, 204, 0, 0.1)"
            : "";
          mobileBestReviewBtn.style.color = currentMobileReviewBest
            ? "#ffcc00"
            : "";
          mobileBestReviewBtn.style.borderColor = currentMobileReviewBest
            ? "#ffcc00"
            : "";
          mobileBestReviewBtn.innerHTML = currentMobileReviewBest
            ? '<i class="fa-solid fa-star"></i> BEST: ACTIVE'
            : '<i class="fa-solid fa-award"></i> MARK AS BEST';
        }

        if (reviewActionModal) reviewActionModal.classList.add("active");
      }
    });
  }

  if (reviewActionClose)
    reviewActionClose.addEventListener("click", () =>
      reviewActionModal.classList.remove("active"),
    );

  if (mobileBestReviewBtn) {
    mobileBestReviewBtn.addEventListener("click", () => {
      if (currentMobileReviewId) {
        window.toggleBestReview(currentMobileReviewId, currentMobileReviewBest);
        reviewActionModal.classList.remove("active");
      }
    });
  }

  if (mobileDeleteReviewBtn) {
    mobileDeleteReviewBtn.addEventListener("click", () => {
      if (currentMobileReviewId) {
        window.deleteReview(currentMobileReviewId);
        reviewActionModal.classList.remove("active");
      }
    });
  }

  // Order Status Action Logic (Mobile)
  const orderDetailModal = document.getElementById("order-detail-modal");
  const orderDetailClose = document.getElementById("order-detail-close");
  const modalCloseBtns = document.querySelectorAll(".modal-close-btn");

  if (orderDetailClose)
    orderDetailClose.addEventListener("click", () =>
      orderDetailModal.classList.remove("active"),
    );
  modalCloseBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal-overlay");
      if (modal) modal.classList.remove("active");
    }),
  );

  let productToDeleteId = null;
  let productToWipeId = null;
  let recoveryBuffer = null;

  window.deleteProduct = (id) => {
    if (!Firewall.isAdmin())
      return alert("SECURITY PROTOCOL: UNAUTHORIZED ACCESS BLOCKED.");

    productToDeleteId = id;
    document.getElementById("delete-modal").classList.add("active");
  };

  window.restoreProduct = async (id) => {
    if (!Firewall.isAdmin()) return;
    const product = state.trash.find((p) => p.id === id);

    if (product) {
      const row = document.getElementById(`trash-row-${id}`);
      if (row) row.classList.add("row-exit");
      await new Promise((r) => setTimeout(r, 500));

      await DB.restoreFromTrash(product);
      showToast(`GEAR RESTORED: ${product.name}`);
    }
  };

  window.permanentDelete = (id) => {
    if (!Firewall.isAdmin()) return;
    productToWipeId = id;
    document.getElementById("wipe-modal").classList.add("active");
  };

  const confirmWipeBtn = document.getElementById("confirm-wipe-btn");
  if (confirmWipeBtn) {
    confirmWipeBtn.addEventListener("click", async () => {
      if (!productToWipeId) return;

      const originalText = confirmWipeBtn.innerHTML;
      confirmWipeBtn.disabled = true;
      confirmWipeBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> WIPING...';

      try {
        const product = state.trash.find((p) => p.id === productToWipeId);
        if (product) {
          const row = document.getElementById(`trash-row-${productToWipeId}`);
          if (row) row.classList.add("row-exit");

          await new Promise((r) => setTimeout(r, 500)); // Wait for animation
          await DB.wipeFromTrash(productToWipeId);
          showToast(`PERMANENT WIPEOUT COMPLETE: ${product.name}`);
        }
        document.getElementById("wipe-modal").classList.remove("active");
        productToWipeId = null;
      } catch (error) {
        console.error("WIPE ERROR:", error);
        showToast("SYSTEM ERROR: WIPEOUT FAILED.");
      } finally {
        confirmWipeBtn.disabled = false;
        confirmWipeBtn.innerHTML = originalText;
      }
    });
  }

  const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!productToDeleteId) return;

      const originalText = confirmDeleteBtn.innerHTML;
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> DELETING...';

      try {
        const productToDelete = state.products.find(
          (p) => p.id === productToDeleteId,
        );
        if (productToDelete) {
          const row = document.getElementById(`admin-row-${productToDeleteId}`);
          if (row) row.classList.add("row-exit");

          await new Promise((r) => setTimeout(r, 500)); // Wait for animation
          await DB.deleteToTrash(productToDelete);
          showToast(`GEAR SHUTDOWN: ${productToDelete.name}`);
        }

        document.getElementById("delete-modal").classList.remove("active");
        productToDeleteId = null;
      } catch (error) {
        console.error("DELETION ERROR:", error);
        showToast("FAILED TO DELETE PRODUCT.");
        document.getElementById("delete-modal").classList.remove("active");
      } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = originalText;
      }
    });
  }

  window.openEditProduct = (id) => {
    if (!Firewall.isAdmin()) {
      showToast("ACCESS DENIED: UNAUTHORIZED ACTION.");
      return;
    }
    const p = state.products.find((p) => p.id === id);
    if (p) {
      const selectedCategoryId =
        p.categoryId ||
        state.categories.find((c) => c.name === p.category)?.id ||
        "uncategorized";

      document.getElementById("product-modal-title").innerHTML =
        'EDIT <span class="accent">PRODUCT</span>';
      document.getElementById("edit-id").value = p.id;
      document.getElementById("p-name").value = p.name;
      document.getElementById("p-description").value = p.description || "";
      renderCategoryOptions(selectedCategoryId);
      document.getElementById("p-price").value = p.price;

      // Set URL and preview
      urlInput.value = p.img;
      selectedImageFile = null;
      fileInput.value = "";
      // Reset state
      selectedImageFile = null;
      setProcessingState(false);

      // Reset dropzone UI
      const dropzoneText = dropzone.querySelector("p");
      const dropzoneIcon = dropzone.querySelector("i");
      if (dropzoneText)
        dropzoneText.innerHTML =
          'DRAG GEAR OR <span class="accent">BROWSE</span>';
      if (dropzoneIcon) dropzoneIcon.className = "fa-solid fa-cloud-arrow-up";

      updateImgMode("url");
      showPreview(p.img);

      document.getElementById("product-modal").classList.add("active");
    }
  };

  const addProductBtn = document.getElementById("add-product-trigger");
  const productForm = document.getElementById("product-form");
  const imgModes = document.querySelectorAll(".product-img-mode");
  const urlWrapper = document.getElementById("p-img-url-wrapper");
  const uploadWrapper = document.getElementById("p-img-upload-wrapper");
  const imgPreviewContainer = document.getElementById(
    "p-img-preview-container",
  );
  const imgPreview = document.getElementById("p-img-preview");
  const urlInput = document.getElementById("p-img");
  const fileInput = document.getElementById("p-img-file");
  const dropzone = document.getElementById("image-dropzone");
  const removePreviewBtn = document.getElementById("remove-preview");

  let currentImageMode = "url";
  let selectedImageFile = null;
  let isProcessing = false;

  const setProcessingState = (processing) => {
    isProcessing = processing;
    const saveBtn = document.getElementById("product-save-btn");
    if (!saveBtn) return;

    if (isProcessing) {
      saveBtn.disabled = true;
      saveBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> PROCESSING...';
      saveBtn.style.opacity = "0.7";
      saveBtn.style.cursor = "not-allowed";
      saveBtn.style.boxShadow = "0 0 20px rgba(0, 255, 242, 0.2)";
    } else {
      saveBtn.disabled = false;
      saveBtn.innerHTML = "SAVE PRODUCT";
      saveBtn.style.opacity = "1";
      saveBtn.style.cursor = "pointer";
      saveBtn.style.boxShadow = "none";
    }
  };

  const uploadImage = (file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "dyqf4ck8h");

      const xhr = new XMLHttpRequest();
      const dropzoneText = dropzone.querySelector("p");
      const dropzoneIcon = dropzone.querySelector("i");
      const originalText = 'DRAG GEAR OR <span class="accent">BROWSE</span>';
      const originalIconClass = "fa-solid fa-cloud-arrow-up";

      // Create progress bar if not exists
      let progressBar = dropzone.querySelector(".upload-progress-bar");
      if (!progressBar) {
        progressBar = document.createElement("div");
        progressBar.className = "upload-progress-bar";
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

      progressBar.style.width = "0%";
      if (dropzoneIcon) dropzoneIcon.className = "fa-solid fa-spinner fa-spin";
      dropzone.style.borderColor = "var(--accent)";

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          if (dropzoneText)
            dropzoneText.innerHTML = `UPLOADING GEAR... <span class="accent">${percent}%</span>`;
          progressBar.style.width = `${percent}%`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          if (data.secure_url) {
            progressBar.style.width = "100%";
            if (dropzoneText)
              dropzoneText.innerHTML =
                '<i class="fa-solid fa-check"></i> IMAGE SECURED';
            if (dropzoneIcon)
              dropzoneIcon.className = "fa-solid fa-circle-check";

            setTimeout(() => {
              progressBar.style.width = "0%";
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
        progressBar.style.width = "0%";
        if (dropzoneText)
          dropzoneText.innerHTML =
            '<span style="color: #ff4d4d">UPLOAD FAILED</span>';
        if (dropzoneIcon)
          dropzoneIcon.className = "fa-solid fa-triangle-exclamation";
        setTimeout(() => {
          if (dropzoneText) dropzoneText.innerHTML = originalText;
          if (dropzoneIcon) dropzoneIcon.className = originalIconClass;
        }, 3000);
        reject(new Error("NETWORK ERROR"));
      };

      xhr.open(
        "POST",
        "https://api.cloudinary.com/v1_1/dyqf4ck8h/image/upload",
      );
      xhr.send(formData);
    });
  };

  const updateImgMode = (mode) => {
    currentImageMode = mode;
    imgModes.forEach((b) => {
      const isActive = b.dataset.mode === mode;
      b.classList.toggle("active", isActive);
      if (isActive) {
        b.style.background = "var(--accent)";
        b.style.color = "#000";
        b.style.boxShadow = "0 0 10px rgba(0,255,242,0.3)";
      } else {
        b.style.background = "transparent";
        b.style.color = "rgba(255,255,255,0.4)";
        b.style.boxShadow = "none";
      }
    });

    if (mode === "url") {
      urlWrapper.style.display = "block";
      uploadWrapper.style.display = "none";
      if (urlInput.value && urlInput.value.length > 5)
        showPreview(urlInput.value);
      else hidePreview();
    } else {
      urlWrapper.style.display = "none";
      uploadWrapper.style.display = "block";
      if (selectedImageFile) {
        const reader = new FileReader();
        reader.onload = (e) => showPreview(e.target.result);
        reader.readAsDataURL(selectedImageFile);
      } else hidePreview();
    }
  };

  const showPreview = (src) => {
    imgPreview.src = src;
    imgPreviewContainer.style.display = "block";
  };

  const hidePreview = () => {
    imgPreview.src = "";
    imgPreviewContainer.style.display = "none";
  };

  imgModes.forEach((btn) =>
    btn.addEventListener("click", () => updateImgMode(btn.dataset.mode)),
  );

  urlInput.addEventListener("input", (e) => {
    urlWrapper.style.borderColor = "rgba(255,255,255,0.1)";
    uploadWrapper.style.borderColor = "rgba(255,255,255,0.1)";
    if (currentImageMode === "url" && e.target.value)
      showPreview(e.target.value);
    else if (currentImageMode === "url") hidePreview();
  });

  fileInput.addEventListener("change", (e) => {
    urlWrapper.style.borderColor = "rgba(255,255,255,0.1)";
    uploadWrapper.style.borderColor = "rgba(255,255,255,0.1)";
    const file = e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => showPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  });

  removePreviewBtn.addEventListener("click", () => {
    selectedImageFile = null;
    fileInput.value = "";
    urlInput.value = "";
    hidePreview();
    const dropzoneText = dropzone.querySelector("p");
    const dropzoneIcon = dropzone.querySelector("i");
    if (dropzoneText)
      dropzoneText.innerHTML =
        'DRAG GEAR OR <span class="accent">BROWSE</span>';
    if (dropzoneIcon) dropzoneIcon.className = "fa-solid fa-cloud-arrow-up";
  });

  // Handle Drag and Drop
  if (dropzone) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    dropzone.addEventListener("dragover", () => {
      dropzone.style.borderColor = "var(--accent)";
      dropzone.style.background = "rgba(0,255,242,0.05)";
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.style.borderColor = "rgba(255,255,255,0.1)";
      dropzone.style.background = "transparent";
    });
    dropzone.addEventListener("drop", (e) => {
      dropzone.style.borderColor = "rgba(255,255,255,0.1)";
      dropzone.style.background = "transparent";
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        selectedImageFile = file;
        fileInput.files = e.dataTransfer.files;
        const reader = new FileReader();
        reader.onload = (ev) => showPreview(ev.target.result);
        reader.readAsDataURL(file);
      }
    });
  }

  if (addProductBtn) {
    addProductBtn.addEventListener("click", () => {
      document.getElementById("product-modal-title").innerHTML =
        'ADD <span class="accent">PRODUCT</span>';
      productForm.reset();
      document.getElementById("edit-id").value = "";
      selectedImageFile = null;
      setProcessingState(false);
      hidePreview();
      updateImgMode("url");
      renderCategoryOptions();

      // Reset dropzone UI
      const dropzoneText = dropzone.querySelector("p");
      const dropzoneIcon = dropzone.querySelector("i");
      if (dropzoneText)
        dropzoneText.innerHTML =
          'DRAG GEAR OR <span class="accent">BROWSE</span>';
      if (dropzoneIcon) dropzoneIcon.className = "fa-solid fa-cloud-arrow-up";

      document.getElementById("product-modal").classList.add("active");
    });
  }

  if (productForm) {
    productForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!Firewall.isAdmin() || isProcessing) return;

      console.log("[SAVE_CLICKED]");

      // 1. Gather Data & Validate
      const editId = document.getElementById("edit-id").value;
      const pName = document.getElementById("p-name").value.trim();
      const pDescription = document.getElementById("p-description").value.trim();
      const pCategory = document.getElementById("p-category").value;
      const pPrice = parseInt(document.getElementById("p-price").value);
      const pUrl = urlInput.value.trim();
      const existingImg =
        imgPreview.src && !imgPreview.src.startsWith("data:")
          ? imgPreview.src
          : null;

      if (!pName || isNaN(pPrice)) {
        return showToast("VALIDATION ERROR: MISSING NAME OR PRICE.");
      }

      setProcessingState(true);

      try {
        let finalImgUrl = "";

        // 2. LINEAR PIPELINE: IMAGE ACQUISITION
        if (currentImageMode === "url") {
          finalImgUrl = pUrl || existingImg;
          if (!finalImgUrl) throw new Error("IMAGE URL REQUIRED.");
        } else {
          if (selectedImageFile) {
            showToast("INITIATING UPLOAD...");
            console.log("[UPLOAD_START]");
            finalImgUrl = await uploadImage(selectedImageFile);
            console.log("[UPLOAD_DONE] URL:", finalImgUrl);
          } else if (existingImg) {
            finalImgUrl = existingImg;
          } else {
            throw new Error("NO IMAGE PROVIDED.");
          }
        }

        if (!finalImgUrl) throw new Error("UPLOAD FAILED");

        // 3. FIRESTORE PERSISTENCE
        const productData = {
          name: pName,
          categoryId: pCategory === "uncategorized" ? null : pCategory,
          price: pPrice,
          img: finalImgUrl,
          description: pDescription,
        };
        console.log("[SAVE_START]", productData);

        if (editId) {
          await DB.updateProduct(editId, productData);
        } else {
          await DB.addProduct(productData);
        }
        console.log("[SAVE_SUCCESS]");
        showToast(editId ? "GEAR UPDATED." : "NEW GEAR REGISTERED.");

        // 4. CLEANUP
        const modal = document.getElementById("product-modal");
        if (modal) modal.classList.remove("active");

        productForm.reset();
        selectedImageFile = null;
        fileInput.value = "";
        hidePreview();
      } catch (err) {
        console.error("[SAVE_ERROR]:", err);
        showToast(`REJECTION: ${err.message}`);
      } finally {
        console.log("[FINALLY_BLOCK_REACHED]");
        setProcessingState(false);
      }
    });
  }

  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("logout-btn")) {
        Firewall.terminateSession();
        if (adminSidebar && adminSidebar.classList.contains("active"))
          toggleAdminSidebar();
        return;
      }
      if (!Firewall.isAuthenticated()) return;

      document
        .querySelectorAll(".admin-nav-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".admin-tab")
        .forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const tabEl = document.getElementById(`admin-${btn.dataset.tab}`);
      if (tabEl) tabEl.classList.add("active");

      // Auto-close sidebar on mobile after selection
      if (
        window.innerWidth <= 900 &&
        adminSidebar &&
        adminSidebar.classList.contains("active")
      ) {
        toggleAdminSidebar();
      }

      if (btn.dataset.tab === "logs") renderLogs();
      if (btn.dataset.tab === "trash") renderTrash();
      if (btn.dataset.tab === "categories") renderAdminCategories();
    });
  });

  // 5.1 SECURITY SETTINGS LOGIC (RESTRICTED TO ADMIN)
  const securityUpdateForm = document.getElementById("security-update-form");
  if (securityUpdateForm) {
    securityUpdateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!Firewall.isAdmin()) {
        showToast("SECURITY BREACH: UNAUTHORIZED SYSTEM MODIFICATION ATTEMPT.");
        return;
      }

      const currentPass = document.getElementById("current-pass").value;
      const newPass = document.getElementById("new-pass").value;
      const msg = document.getElementById("security-update-msg");
      const user = auth.currentUser;

      if (!user) return;

      try {
        // Re-authenticate user before changing password (required by Firebase for sensitive actions)
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPass,
        );
        await reauthenticateWithCredential(user, credential);

        // Update password
        await updatePassword(user, newPass);

        msg.textContent = "SUCCESS: SYSTEM ACCESS KEY ROTATED.";
        msg.style.color = "var(--accent)";
        msg.style.display = "block";
        securityUpdateForm.reset();
        showToast("SYSTEM SECURITY UPDATED.");

        setTimeout(() => {
          msg.style.display = "none";
        }, 5000);
      } catch (error) {
        console.error("SECURITY UPDATE ERROR:", error);
        msg.textContent =
          "ERROR: " +
          (error.code === "auth/wrong-password"
            ? "INVALID CURRENT ACCESS KEY."
            : "UNABLE TO UPDATE KEY.");
        msg.style.color = "#ff4d4d";
        msg.style.display = "block";
        showToast("SECURITY UPDATE FAILED.");
      }
    });
  }

  // 6. NAVIGATION & VIEWS
  document.querySelectorAll('a[href^="#"], .back-to-shop').forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (!href || href.length <= 1) return;
      e.preventDefault();
      const [view, queryString] = href.substring(1).split("?");
      const searchParams = new URLSearchParams(queryString || "");
      const search = searchParams.get("search") || "";
      viewingCart = view === "cart";
      if (view === "admin-gate" || href === "#admin-gate") {
        document.getElementById("admin-gate-modal").classList.add("active");
        return;
      }
      if (view === "admin") {
        if (Firewall.isAuthenticated()) showView("admin");
        else
          document.getElementById("admin-gate-modal").classList.add("active");
        return;
      }
      if (search) {
        updateSearchQuery(search);
      }
      const homeSections = [
        "home",
        "features",
        "featured",
        "about",
        "testimonials",
        "newsletter",
      ];
      if (homeSections.includes(view)) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#home",
        );
        showView("home");
        const el = document.getElementById(view);
        if (el) window.scrollTo({ top: el.offsetTop - 70, behavior: "smooth" });
      } else if (view === "shop") {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#shop",
        );
        showView("shop");
      } else if (view === "reviews") {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#reviews",
        );
        showView("reviews");
      } else if (view === "cart") {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#cart",
        );
        showView("cart");
        renderCart();
      } else if (view === "wishlist") {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + "#wishlist",
        );
        showView("wishlist");
      }
    });
  });

  const cartTrigger = document.querySelector(".cart-trigger");
  if (cartTrigger) {
    cartTrigger.addEventListener("click", () => {
      viewingCart = true;
      showView("cart");
      renderCart();
    });
  }

  document.querySelectorAll(".modal-close, .modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      btn.closest(".modal-overlay").classList.remove("active");
    });
  });

  // Close modals on background click
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("active");
      }
    });
  });

  // Close modals on ESC key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.active").forEach((modal) => {
        modal.classList.remove("active");
      });
    }
  });

  // ===== PRODUCT VIEW PAGE RENDERING =====
  const renderProductPage = (productId) => {
    const container = document.getElementById("product-view-layout");
    if (!container) return;

    // Find product from state or from DOM data (for non-Firestore products)
    let product = state.products.find((p) => p.id === productId);
    
    if (!product) {
      // Try to find from dataset (featured products with data-attributes)
      const card = document.querySelector(`.product-card[data-id="${productId}"]`);
      if (card) {
        product = {
          id: card.dataset.id,
          name: card.dataset.name,
          price: parseInt(card.dataset.price),
          img: card.dataset.img,
          category: card.dataset.category || "",
        };
      }
    }

    if (!product) {
      container.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem;">
          <i class="fa-solid fa-box-open" style="font-size: 3rem; color: var(--accent); opacity: 0.3; margin-bottom: 1.5rem; display: block;"></i>
          <h2>PRODUCT <span class="accent">NOT FOUND</span></h2>
          <p style="margin: 1rem 0 2rem;">This gear may have been discontinued or relocated.</p>
          <a href="#shop" class="btn btn-primary"><i class="fa-solid fa-arrow-left"></i> BACK TO CATALOG</a>
        </div>
      `;
      return;
    }

    const categoryLabel = getCategoryLabel(product.categoryId, product.category) || "Essential";
    const priceStr = product.price.toLocaleString();

    container.innerHTML = `
      <a href="#shop" class="product-view-back"><i class="fa-solid fa-arrow-left"></i> BACK TO CATALOG</a>
      <div class="product-view-layout product-view">
        <div class="product-view-image-wrapper">
          <img src="${product.img}" alt="${product.name}" class="product-view-image" loading="lazy">
        </div>
        <div class="product-view-details">
          <div>
            <span class="product-view-brand">3DRIP</span>
            <span class="product-view-category" style="margin-left: 1rem;">${categoryLabel}</span>
          </div>
          <h1 class="product-view-name">${product.name}</h1>
          <div>
            <div class="product-view-price">${priceStr} DZD</div>
            <div class="product-view-price-label">Algerian Dinar — Tax Inclusive</div>
          </div>
          <div class="product-view-description">
            <div class="product-view-description-label">About This Item</div>
            <div class="product-view-description-text">${product.description || "Premium quality streetwear essential from the 3DRIP collection. Built for those who refuse to stay in the shadows. Each piece is crafted with precision and designed for the future."}</div>
          </div>
          <div class="product-view-qty">
            <label class="product-view-qty-label" for="pv-qty">Quantity</label>
            <div class="product-qty-controls">
              <button class="qty-btn qty-minus" id="pv-qty-minus">−</button>
              <div class="qty-display" id="pv-qty-display">1</div>
              <button class="qty-btn qty-plus" id="pv-qty-plus">+</button>
            </div>
          </div>
          <div class="product-view-actions">
            <button class="btn btn-primary" id="pv-add-to-cart">
              <i class="fa-solid fa-cart-plus"></i> ADD TO CART — ${priceStr} DZD
            </button>
            <button class="btn btn-outline buy-now-btn" id="pv-buy-now" style="border: 1px solid #a855f7 !important; color: #a855f7 !important;">
              <i class="fa-solid fa-bolt"></i> BUY NOW
            </button>
          </div>
        </div>
      </div>
    `;

    // Initialize quantity value (stored outside the DOM for reliability)
    let currentQty = 1;
    const qtyDisplay = document.getElementById("pv-qty-display");
    const qtyMinus = document.getElementById("pv-qty-minus");
    const qtyPlus = document.getElementById("pv-qty-plus");

    // Quantity button handlers
    if (qtyMinus) {
      qtyMinus.addEventListener("click", () => {
        if (currentQty > 1) {
          currentQty--;
          qtyDisplay.textContent = currentQty;
        }
      });
    }

    if (qtyPlus) {
      qtyPlus.addEventListener("click", () => {
        currentQty++;
        qtyDisplay.textContent = currentQty;
      });
    }

    // Wire up Add to Cart on product page
    const addBtn = document.getElementById("pv-add-to-cart");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const qty = currentQty;
        addToCart(product, qty);
        showToast(`ADDED TO BAG: ${product.name} x${qty}`);
        // Animation feedback
        addBtn.innerHTML = '<i class="fa-solid fa-check"></i> ADDED!';
        addBtn.style.background = "white";
        addBtn.style.color = "black";
        addBtn.disabled = true;
        setTimeout(() => {
          addBtn.innerHTML = '<i class="fa-solid fa-cart-plus"></i> ADD TO CART — ${priceStr} DZD';
          addBtn.style.background = "";
          addBtn.style.color = "";
          addBtn.disabled = false;
        }, 1500);
      });
    }

    // Wire up Buy Now on product page
    const buyBtn = document.getElementById("pv-buy-now");
    if (buyBtn) {
      buyBtn.addEventListener("click", () => {
        const qty = currentQty;
        openBuyNowCheckout(product, qty);
      });
    }
  };

  // ===== BUY NOW FLOW =====
  let buyNowProduct = null;

  const openBuyNowCheckout = (product, quantity = 1) => {
    buyNowProduct = {
      product: product,
      quantity: quantity,
    };

    // Set checkout type to "buynow"
    document.getElementById("checkout-type").value = "buynow";
    document.getElementById("checkout-product-id").value = product.id;

    // Show order summary
    const summaryDiv = document.getElementById("checkout-order-summary");
    const summaryItems = document.getElementById("checkout-summary-items");
    const summaryTotal = document.getElementById("checkout-summary-total");
    const total = product.price * quantity + 500;

    summaryItems.innerHTML = `
      <div class="checkout-summary-item">
        <span class="item-name">${product.name} × ${quantity}</span>
        <span class="item-price">${(product.price * quantity).toLocaleString()} DZD</span>
      </div>
      <div class="checkout-summary-item" style="opacity: 0.6; font-size: 0.8rem;">
        <span>Delivery</span>
        <span>500 DZD</span>
      </div>
    `;
    summaryTotal.textContent = `${total.toLocaleString()} DZD`;
    summaryDiv.style.display = "block";

    // Hide order-success, show form
    document.getElementById("order-success").classList.remove("active");
    document.getElementById("order-form").style.display = "block";

    // Prefill with product info in summary
    const submitBtn = document.getElementById("checkout-submit-btn");
    submitBtn.textContent = `BUY NOW — ${total.toLocaleString()} DZD`;

    // Open modal
    document.getElementById("checkout-modal").classList.add("active");
  };

  // 7. CHECKOUT LOGIC (enhanced)
  const orderForm = document.getElementById("order-form");
  const checkoutTrigger = document.querySelector(".checkout-trigger");

  // 7.1 REVIEW SUBMISSION LOGIC
  const reviewForm = document.getElementById("review-form");
  const writeReviewBtn = document.getElementById("write-review-btn");
  const reviewModal = document.getElementById("review-modal");
  const starInput = document.getElementById("star-input");
  const revRating = document.getElementById("rev-rating");
  const revAvatarFile = document.getElementById("rev-avatar-file");
  const revImgModes = document.querySelectorAll(".rev-img-mode");
  const revImgUploadWrapper = document.getElementById("rev-img-upload-wrapper");

  let currentRevImgMode = "none";

  if (revImgModes.length > 0) {
    revImgModes.forEach((btn) => {
      btn.addEventListener("click", () => {
        currentRevImgMode = btn.dataset.mode;
        revImgModes.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        revImgUploadWrapper.style.display =
          currentRevImgMode === "upload" ? "block" : "none";
      });
    });
  }

  if (writeReviewBtn) {
    writeReviewBtn.addEventListener("click", () => {
      reviewModal.classList.add("active");
    });
  }

  if (starInput) {
    starInput.addEventListener("click", (e) => {
      if (e.target.dataset.rating) {
        const rating = parseInt(e.target.dataset.rating);
        revRating.value = rating;
        const stars = starInput.querySelectorAll("i");
        stars.forEach((s, i) => {
          if (i < rating) {
            s.style.color = "#ffcc00";
            s.style.opacity = "1";
          } else {
            s.style.color = "white";
            s.style.opacity = "0.2";
          }
        });
      }
    });
  }

  if (reviewForm) {
    reviewForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("submit-review-btn");
      const originalText = submitBtn.innerHTML;

      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> TRANSMITTING...';

      let avatarUrl = null;
      if (currentRevImgMode === "upload" && revAvatarFile.files[0]) {
        try {
          avatarUrl = await uploadImage(revAvatarFile.files[0]);
        } catch (err) {
          console.error("AVATAR UPLOAD ERROR:", err);
        }
      }

      const reviewData = {
        name: document.getElementById("rev-name").value,
        rating: parseInt(revRating.value),
        message: document.getElementById("rev-message").value,
        status: "PENDING",
        avatar: avatarUrl,
        isBest: false,
        createdAt: new Date().toISOString(),
      };

      try {
        await DB.saveReview(reviewData);
        showToast("TRANSMISSION SUCCESSFUL. PENDING MODERATION.");
        reviewModal.classList.remove("active");
        reviewForm.reset();
        // Reset stars
        const stars = starInput.querySelectorAll("i");
        stars.forEach((s) => {
          s.style.color = "#ffcc00";
          s.style.opacity = "1";
        });
        revRating.value = "5";
      } catch (error) {
        showToast("TRANSMISSION FAILED: INTERFERENCE DETECTED.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  if (checkoutTrigger) {
    checkoutTrigger.addEventListener("click", () => {
      if (cart.length === 0) {
        alert("YOUR BAG IS EMPTY.");
        return;
      }
      // Reset to cart mode
      document.getElementById("checkout-type").value = "cart";
      document.getElementById("checkout-order-summary").style.display = "none";
      document.getElementById("checkout-submit-btn").textContent = "CONFIRM ORDER";
      document.getElementById("checkout-modal").classList.add("active");
      document.getElementById("order-form").style.display = "block";
      document.getElementById("order-success").classList.remove("active");
    });
  }
  if (orderForm) {
    orderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("[CHECKOUT_SUBMIT]");

      const checkoutType = document.getElementById("checkout-type").value;
      const customerName = document.getElementById("checkout-name").value.trim();
      const customerPhone = document.getElementById("checkout-phone").value.trim();
      const customerWilaya = document.getElementById("checkout-wilaya").value.trim();
      const customerCity = document.getElementById("checkout-city").value.trim();
      const customerAddress = document.getElementById("checkout-address").value.trim();
      const customerNotes = document.getElementById("checkout-notes").value.trim();

      console.log("[CHECKOUT_START] type:", checkoutType);

      // Validation
      if (!customerName || !customerPhone || !customerWilaya || !customerCity || !customerAddress) {
        showToast("PLEASE COMPLETE ALL REQUIRED FIELDS.");
        return;
      }

      const fullAddress = `${customerAddress}, ${customerCity}, ${customerWilaya}`;

      let items = [];
      let total = 0;

      if (checkoutType === "buynow" && buyNowProduct) {
        // Buy Now: purchase just this single product
        const qty = buyNowProduct.quantity;
        items = [{
          id: buyNowProduct.product.id,
          name: buyNowProduct.product.name,
          price: buyNowProduct.product.price,
          img: buyNowProduct.product.img,
          quantity: qty,
        }];
        total = buyNowProduct.product.price * qty + 500;
      } else {
        // Cart checkout
        if (cart.length === 0) {
          showToast("YOUR BAG IS EMPTY.");
          return;
        }
        items = [...cart];
        total = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0) + 500;
      }

      const newOrder = {
        customer: {
          name: customerName,
          phone: customerPhone,
          address: fullAddress,
          wilaya: customerWilaya,
          city: customerCity,
          notes: customerNotes,
        },
        items: items,
        total: total,
        status: "PENDING",
      };

      const submitBtn = document.getElementById("checkout-submit-btn");
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESSING...';

      try {
        await DB.saveOrder(newOrder);
        orderForm.style.display = "none";
        document.getElementById("order-success").classList.add("active");

        // Clear cart only on cart checkout
        if (checkoutType !== "buynow") {
          cart = [];
          updateCartUI();
        }

        // Reset buy now state
        buyNowProduct = null;
        document.getElementById("checkout-type").value = "cart";
        document.getElementById("checkout-order-summary").style.display = "none";

        showToast("ORDER DEPLOYED SUCCESSFULLY!");
      } catch (err) {
        console.error("[CHECKOUT_FAILED]", err);
        showToast("ORDER FAILED: UNABLE TO CONTACT SYSTEM.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // STICKY NAV & EFFECTS
  const nav = document.querySelector(".nav");
  window.addEventListener("scroll", () => {
    if (nav) {
      if (window.scrollY > 50) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    }
  });
  const handleScrollReveal = () => {
    document.querySelectorAll(".reveal, .scale-up").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight - 100)
        el.classList.add("active");
    });
  };
  window.addEventListener("scroll", handleScrollReveal);
  setTimeout(handleScrollReveal, 500);
  window.addEventListener("scroll", () => {
    const heroImg = document.querySelector(".hero-img");
    if (heroImg)
      heroImg.style.transform = `translateY(${window.pageYOffset * 0.4}px)`;
  });

  // 8. PASSWORD VISIBILITY TOGGLE SYSTEM
  const initPasswordToggles = () => {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach((input) => {
      // Skip if already has a toggle nearby
      if (input.parentElement.classList.contains("password-wrapper")) return;

      // Create wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "password-wrapper";

      // Insert wrapper before input, then move input inside
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      // Create toggle button
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "password-toggle";
      toggleBtn.setAttribute("aria-label", "Toggle Password Visibility");
      toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';

      wrapper.appendChild(toggleBtn);

      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const type =
          input.getAttribute("type") === "password" ? "text" : "password";
        input.setAttribute("type", type);

        // Update icon
        const icon = toggleBtn.querySelector("i");
        if (type === "text") {
          icon.classList.remove("fa-eye");
          icon.classList.add("fa-eye-slash");
          toggleBtn.style.color = "var(--accent)";
          toggleBtn.style.opacity = "1";
        } else {
          icon.classList.remove("fa-eye-slash");
          icon.classList.add("fa-eye");
          toggleBtn.style.color = "var(--text-secondary)";
          toggleBtn.style.opacity = "0.6";
        }
      });
    });
  };

  initPasswordToggles();
  // Re-run whenever modals might be re-rendered or content changes if needed
  window.addEventListener("viewChanged", initPasswordToggles);

  // HIDE LOADER - ENSURE SYSTEM ENTRANCE
  const hideLoader = () => {
    const loader = document.getElementById("app-loading");
    if (loader) {
      console.log("[SYSTEM] CLEARING APP LOADING OVERLAY.");
      loader.style.opacity = "0";
      setTimeout(() => {
        loader.style.visibility = "hidden";
        loader.remove();
        console.log("[SYSTEM] MAINFRAME SYNC COMPLETE.");
      }, 500);
    }
  };

  // Final safety: release loader after 4 seconds regardless
  setTimeout(hideLoader, 4000);

  // Handle initial navigation state and hash query search
  handleHashNavigation();
  window.addEventListener("hashchange", handleHashNavigation);
  console.log("[SYSTEM] INITIALIZATION SEQUENCE TERMINATED.");

  // Slight delay for smooth entrance
  setTimeout(hideLoader, 1500);

  // START LISTENERS LAST
  startListeners();

  // ===== MOBILE FILTER & SORT BOTTOM SHEETS =====
  const mobileFilterBtn = document.getElementById("mobile-filter-btn");
  const mobileSortBtn = document.getElementById("mobile-sort-btn");
  const mobileFilterSheet = document.getElementById("mobile-filter-sheet");
  const mobileSortSheet = document.getElementById("mobile-sort-sheet");
  const closeFilterSheet = document.getElementById("close-filter-sheet");
  const closeSortSheet = document.getElementById("close-sort-sheet");
  const filterSheetOverlay = document.getElementById("filter-sheet-overlay");
  const sortSheetOverlay = document.getElementById("sort-sheet-overlay");
  const applyFiltersBtn = document.getElementById("apply-mobile-filters");
  const mobilePriceSlider = document.getElementById("mobile-price-slider");
  const mobilePriceValue = document.getElementById("mobile-price-value");
  const mobileCategoriesList = document.getElementById("mobile-categories-list");

  // Helper function to open bottom sheet
  const openBottomSheet = (sheet) => {
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  // Helper function to close bottom sheet
  const closeBottomSheet = (sheet) => {
    sheet.classList.add("closing");
    setTimeout(() => {
      sheet.setAttribute("aria-hidden", "true");
      sheet.classList.remove("closing");
      document.body.style.overflow = "";
    }, 300);
  };

  // Open/Close Filter Sheet
  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener("click", () => {
      openBottomSheet(mobileFilterSheet);
    });
  }

  if (closeFilterSheet) {
    closeFilterSheet.addEventListener("click", () => {
      closeBottomSheet(mobileFilterSheet);
    });
  }

  if (filterSheetOverlay) {
    filterSheetOverlay.addEventListener("click", () => {
      closeBottomSheet(mobileFilterSheet);
    });
  }

  // Open/Close Sort Sheet
  if (mobileSortBtn) {
    mobileSortBtn.addEventListener("click", () => {
      openBottomSheet(mobileSortSheet);
    });
  }

  if (closeSortSheet) {
    closeSortSheet.addEventListener("click", () => {
      closeBottomSheet(mobileSortSheet);
    });
  }

  if (sortSheetOverlay) {
    sortSheetOverlay.addEventListener("click", () => {
      closeBottomSheet(mobileSortSheet);
    });
  }

  // Populate categories dynamically in mobile filter
  const populateMobileCategories = () => {
    if (!mobileCategoriesList) return;
    
    const categories = state.categories || [];
    mobileCategoriesList.innerHTML = "";
    
    // Add "All" option
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "mobile-filter-item" + (selectedProductCategory === "all" ? " active" : "");
    allBtn.textContent = "All";
    allBtn.dataset.category = "all";
    allBtn.addEventListener("click", () => {
      document.querySelectorAll(".mobile-filter-item").forEach(item => item.classList.remove("active"));
      allBtn.classList.add("active");
      selectedProductCategory = "all";
      renderStore();
      closeBottomSheet(mobileFilterSheet);
    });
    mobileCategoriesList.appendChild(allBtn);
    
    // Add category options
    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mobile-filter-item" + (selectedProductCategory === cat.id ? " active" : "");
      btn.textContent = cat.name;
      btn.dataset.category = cat.id;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mobile-filter-item").forEach(item => item.classList.remove("active"));
        btn.classList.add("active");
        selectedProductCategory = cat.id;
        renderStore();
        closeBottomSheet(mobileFilterSheet);
      });
      mobileCategoriesList.appendChild(btn);
    });
  };

  // Handle price slider update
  if (mobilePriceSlider && mobilePriceValue) {
    mobilePriceSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      mobilePriceValue.textContent = new Intl.NumberFormat("fr-DZ").format(value);
      maxPrice = value;
    });
  }

  // Apply filters button
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", () => {
      renderStore();
      closeBottomSheet(mobileFilterSheet);
    });
  }

  // Handle mobile sort options
  const mobileSortOptions = document.querySelectorAll(".mobile-sort-option");
  mobileSortOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const sortValue = option.dataset.sort;
      
      // Update active state
      mobileSortOptions.forEach(opt => opt.classList.remove("active"));
      option.classList.add("active");
      
      // Update sort select in desktop
      const desktopSortSelect = document.getElementById("sort-select");
      if (desktopSortSelect) {
        desktopSortSelect.value = sortValue;
      }
      
      // Update current sort
      currentSort = sortValue;
      renderStore();
      closeBottomSheet(mobileSortSheet);
    });
  });

  // Initialize mobile categories on load
  populateMobileCategories();

  // Re-populate when categories are created/updated
  const originalCategoryUpdate = window.refreshAdminCategories;
  if (originalCategoryUpdate) {
    window.refreshAdminCategories = function(...args) {
      originalCategoryUpdate.apply(this, args);
      populateMobileCategories();
    };
  }
});
