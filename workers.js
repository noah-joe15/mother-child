export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    // Default to login
    if (path === '/') path = '/login.html';
    
    // Map routes to HTML files
    const routes = {
      '/login.html': 'login.html',
      '/admin.html': 'admin.html',
      '/admin': 'admin.html',
      '/dashboard.html': 'dashboard.html',
      '/dashboard': 'dashboard.html',
      '/triage.html': 'triage.html',
      '/triage': 'triage.html',
    };

    const fileName = routes[path] || 'login.html';

    try {
      const html = await env.__STATIC_CONTENT.get(fileName);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  },
};
