/**
 * MNH RCH — MEGA BRAIN
 * Master responsive controller for native app feel.
 * Handles sidebar, bottom nav, PWA, gestures, device detection.
 * Wrapped in IIFE to prevent conflicts.
 */
(function () {
    'use strict';

    if (window.__MNH_MEGA_BRAIN_LOADED__) return;
    window.__MNH_MEGA_BRAIN_LOADED__ = true;

    console.log('[Mega Brain] Initialized');

    // ==========================================
    // 1. DEVICE DETECTION
    // ==========================================
    const DeviceDetector = {
        isMobile: function () {
            return window.innerWidth <= 768;
        },
        isTablet: function () {
            return window.innerWidth > 768 && window.innerWidth <= 1024;
        },
        isDesktop: function () {
            return window.innerWidth > 1024;
        },
        isTouchDevice: function () {
            return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        },
        getDeviceClass: function () {
            if (this.isMobile()) return 'device-mobile';
            if (this.isTablet()) return 'device-tablet';
            return 'device-desktop';
        }
    };

    // Apply device class to html
    function applyDeviceClass() {
        document.documentElement.className = document.documentElement.className
            .replace(/\bdevice-\w+/g, '')
            .trim();
        document.documentElement.classList.add(DeviceDetector.getDeviceClass());
        document.documentElement.classList.add(
            DeviceDetector.isTouchDevice() ? 'touch-device' : 'no-touch-device'
        );
    }

    // ==========================================
    // 2. SIDEBAR CONTROLLER
    // ==========================================
    const Sidebar = {
        isOpen: false,
        touchStartX: 0,
        touchStartY: 0,

        open: function () {
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebar_backdrop');
            if (!sidebar || !backdrop) return;

            sidebar.classList.add('open');
            backdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.isOpen = true;
        },

        close: function () {
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebar_backdrop');
            if (!sidebar || !backdrop) return;

            sidebar.classList.remove('open');
            backdrop.classList.remove('active');
            document.body.style.overflow = '';
            this.isOpen = false;
        },

        toggle: function () {
            this.isOpen ? this.close() : this.open();
        },

        handleSwipeOpen: function (e) {
            if (!DeviceDetector.isMobile() || this.isOpen) return;
            if (e.touches[0].clientX > 40) return; // Only swipe from left edge
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        },

        handleSwipeMove: function (e) {
            if (!DeviceDetector.isMobile() || this.isOpen) return;
            if (this.touchStartX > 40) return;
            const deltaX = e.touches[0].clientX - this.touchStartX;
            const deltaY = Math.abs(e.touches[0].clientY - this.touchStartY);
            if (deltaX > 60 && deltaX > deltaY) {
                this.open();
                this.touchStartX = 0;
            }
        },

        handleSwipeClose: function (e) {
            if (!this.isOpen) return;
            this.touchStartX = e.touches[0].clientX;
        },

        handleCloseSwipe: function (e) {
            if (!this.isOpen) return;
            const deltaX = e.touches[0].clientX - this.touchStartX;
            if (deltaX < -80) {
                this.close();
                this.touchStartX = 0;
            }
        }
    };

    // ==========================================
    // 3. SIDEBAR ACTION DISPATCHER
    // ==========================================
    function dispatchSidebarAction(action) {
        Sidebar.close();
        setTimeout(function () {
            switch (action) {
                case 'dashboard':
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                case 'immunization':
                    if (window.viewImmunizationCard) window.viewImmunizationCard();
                    break;
                case 'appointments':
                    if (window.viewAppointments) window.viewAppointments();
                    break;
                case 'growth':
                    if (window.viewGrowthChart) window.viewGrowthChart();
                    break;
                case 'history':
                    if (window.viewVisitHistory) window.viewVisitHistory();
                    break;
                case 'update':
                    if (window.updateMyInfo) window.updateMyInfo();
                    break;
                case 'newborn':
                    if (window.registerNewborn) window.registerNewborn();
                    break;
                case 'logout':
                    if (window.handleLogout) window.handleLogout();
                    break;
                case 'home':
                    window.location.href = 'index.html';
                    break;
            }
        }, 250);
    }

    window.dispatchSidebarAction = dispatchSidebarAction;
    window.Sidebar = Sidebar;

    // ==========================================
    // 4. BOTTOM NAV CONTROLLER
    // ==========================================
    function dispatchBottomNavAction(action) {
        // Haptic feedback where supported
        if (navigator.vibrate) {
            try { navigator.vibrate(10); } catch (e) {}
        }

        setTimeout(function () {
            switch (action) {
                case 'home':
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                case 'schedule':
                    if (window.viewAppointments) window.viewAppointments();
                    break;
                case 'health':
                    if (window.viewGrowthChart) window.viewGrowthChart();
                    break;
                case 'card':
                    if (window.viewImmunizationCard) window.viewImmunizationCard();
                    break;
                case 'profile':
                    if (window.updateMyInfo) window.updateMyInfo();
                    break;
            }
        }, 100);
    }

    window.dispatchBottomNavAction = dispatchBottomNavAction;

    // ==========================================
    // 5. PWA MANAGER
    // ==========================================
    const PWA = {
        deferredPrompt: null,

        init: function () {
            window.addEventListener('beforeinstallprompt', function (e) {
                e.preventDefault();
                PWA.deferredPrompt = e;
                console.log('[Mega Brain] PWA install prompt captured');
            });

            window.addEventListener('appinstalled', function () {
                console.log('[Mega Brain] PWA installed successfully');
                PWA.deferredPrompt = null;
            });
        },

        install: async function () {
            if (!this.deferredPrompt) {
                alert('To install this app, use your browser menu and tap "Add to Home Screen".');
                return;
            }
            this.deferredPrompt.prompt();
            const result = await this.deferredPrompt.userChoice;
            if (result.outcome === 'accepted') {
                console.log('[Mega Brain] User accepted install');
            }
            this.deferredPrompt = null;
        }
    };

    // ==========================================
    // 6. OFFLINE DETECTION
    // ==========================================
    const OfflineManager = {
        init: function () {
            window.addEventListener('online', function () {
                OfflineManager.updateStatus(true);
            });
            window.addEventListener('offline', function () {
                OfflineManager.updateStatus(false);
            });
            this.updateStatus(navigator.onLine);
        },

        updateStatus: function (isOnline) {
            document.documentElement.classList.toggle('offline', !isOnline);
            if (!isOnline) {
                this.showOfflineBanner();
            } else {
                this.hideOfflineBanner();
            }
        },

        showOfflineBanner: function () {
            if (document.getElementById('offline_banner')) return;
            const banner = document.createElement('div');
            banner.id = 'offline_banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px;background:#f59e0b;color:white;text-align:center;font-size:12px;font-weight:600;z-index:10000;';
            banner.textContent = 'You are offline. Some features may be unavailable.';
            document.body.prepend(banner);
        },

        hideOfflineBanner: function () {
            const banner = document.getElementById('offline_banner');
            if (banner) banner.remove();
        }
    };

    // ==========================================
    // 7. INITIALIZE UI
    // ==========================================
    function initSidebar() {
        // Avoid duplicate creation
        if (document.getElementById('sidebar')) return;

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'sidebar_backdrop';
        backdrop.className = 'sidebar-backdrop';
        backdrop.addEventListener('click', function () { Sidebar.close(); });
        document.body.appendChild(backdrop);

        // Get current user info
        const userName = localStorage.getItem('mnh_user_name') || 'User';
        const userPhone = localStorage.getItem('mnh_user_phone') || '';

        // Create sidebar
        const sidebar = document.createElement('nav');
        sidebar.id = 'sidebar';
        sidebar.className = 'sidebar';
        sidebar.setAttribute('aria-label', 'Main menu');
        sidebar.innerHTML = 
            '<div class="sidebar-header">' +
                '<div class="sidebar-user-info">' +
                    '<div class="sidebar-avatar">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>' +
                            '<circle cx="12" cy="7" r="4"></circle>' +
                        '</svg>' +
                    '</div>' +
                    '<div>' +
                        '<p class="sidebar-user-name">' + userName + '</p>' +
                        '<p class="sidebar-user-phone">' + userPhone + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="sidebar-nav">' +
                '<div class="sidebar-section">' +
                    '<p class="sidebar-section-title">Overview</p>' +
                    '<button class="sidebar-item active" onclick="dispatchSidebarAction(\'dashboard\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
                        '<span>Dashboard</span>' +
                    '</button>' +
                '</div>' +
                '<div class="sidebar-section">' +
                    '<p class="sidebar-section-title">Health Records</p>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'immunization\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                        '<span>Immunization Card</span>' +
                    '</button>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'appointments\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
                        '<span>Appointments</span>' +
                    '</button>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'growth\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' +
                        '<span>Growth Chart</span>' +
                    '</button>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'history\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                        '<span>Visit History</span>' +
                    '</button>' +
                '</div>' +
                '<div class="sidebar-section">' +
                    '<p class="sidebar-section-title">Account</p>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'update\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                        '<span>Update My Info</span>' +
                    '</button>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'newborn\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
                        '<span>Register Newborn</span>' +
                    '</button>' +
                '</div>' +
                '<div class="sidebar-section">' +
                    '<p class="sidebar-section-title">Portal</p>' +
                    '<button class="sidebar-item" onclick="dispatchSidebarAction(\'home\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
                        '<span>Public Portal</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="sidebar-footer">' +
                '<button class="sidebar-logout" onclick="dispatchSidebarAction(\'logout\')">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                    '<span>Logout</span>' +
                '</button>' +
            '</div>';

        document.body.appendChild(sidebar);

        // Touch events for swipe gestures
        document.addEventListener('touchstart', function (e) { Sidebar.handleSwipeOpen(e); }, { passive: true });
        document.addEventListener('touchmove', function (e) { Sidebar.handleSwipeMove(e); }, { passive: true });
        sidebar.addEventListener('touchstart', function (e) { Sidebar.handleSwipeClose(e); }, { passive: true });
        sidebar.addEventListener('touchmove', function (e) { Sidebar.handleSwipeClose(e); }, { passive: true });

        // Escape key to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && Sidebar.isOpen) Sidebar.close();
        });
    }

    function initBottomNav() {
        if (document.getElementById('bottom_nav')) return;

        const nav = document.createElement('nav');
        nav.id = 'bottom_nav';
        nav.className = 'bottom-nav';
        nav.setAttribute('aria-label', 'Primary actions');
        nav.innerHTML = 
            '<button class="bottom-nav-item active" onclick="dispatchBottomNavAction(\'home\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
                '<span class="bottom-nav-label">Home</span>' +
            '</button>' +
            '<button class="bottom-nav-item" onclick="dispatchBottomNavAction(\'schedule\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
                '<span class="bottom-nav-label">Schedule</span>' +
            '</button>' +
            '<button class="bottom-nav-item" onclick="dispatchBottomNavAction(\'card\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                '<span class="bottom-nav-label">Card</span>' +
            '</button>' +
            '<button class="bottom-nav-item" onclick="dispatchBottomNavAction(\'health\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' +
                '<span class="bottom-nav-label">Health</span>' +
            '</button>' +
            '<button class="bottom-nav-item" onclick="dispatchBottomNavAction(\'profile\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
                '<span class="bottom-nav-label">Profile</span>' +
            '</button>';

        document.body.appendChild(nav);
    }

    function initHamburger() {
        // Find navbar and insert hamburger before logo
        const navInner = document.querySelector('.nav-inner');
        if (!navInner) return;
        if (document.getElementById('hamburger_btn')) return;

        const hamburger = document.createElement('button');
        hamburger.id = 'hamburger_btn';
        hamburger.className = 'hamburger-btn';
        hamburger.setAttribute('aria-label', 'Open menu');
        hamburger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
        hamburger.addEventListener('click', function () { Sidebar.toggle(); });

        navInner.insertBefore(hamburger, navInner.firstChild);
    }

    // ==========================================
    // 8. RESIZE HANDLER
    // ==========================================
    let resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            applyDeviceClass();
            // Close sidebar when switching to desktop
            if (!DeviceDetector.isMobile() && Sidebar.isOpen) {
                Sidebar.close();
            }
        }, 150);
    });

    // ==========================================
    // 9. INITIALIZATION
    // ==========================================
    function boot() {
        applyDeviceClass();
        initHamburger();
        initSidebar();
        initBottomNav();
        PWA.init();
        OfflineManager.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
