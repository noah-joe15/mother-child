export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route mapping
    if (path === '/' || path === '/login' || path === '/login.html') {
      return new Response(await LOGIN_HTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (path === '/admin' || path === '/admin.html') {
      return new Response(await ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (path === '/dashboard' || path === '/dashboard.html') {
      return new Response(await DASHBOARD_HTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (path === '/triage' || path === '/triage.html') {
      return new Response(await TRIAGE_HTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Serve CSS
    if (path === '/style.css') {
      return new Response(await STYLE_CSS, {
        headers: { 'Content-Type': 'text/css' }
      });
    }

    // Serve JS
    if (path === '/script.js' || path === '/auth.js' || path === '/dashboard.js') {
      const fileName = path.split('/').pop();
      return new Response(await env[fileName.toUpperCase().replace('.JS', '_JS')], {
        headers: { 'Content-Type': 'application/javascript' }
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

// Import HTML files as text
import LOGIN_HTML from './login.html?raw';
import ADMIN_HTML from './admin.html?raw';
import DASHBOARD_HTML from './dashboard.html?raw';
import TRIAGE_HTML from './triage.html?raw';
import STYLE_CSS from './style.css?raw';
