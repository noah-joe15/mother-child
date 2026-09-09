// ==========================================
// CLOUDFLARE WORKER ROUTER
// ==========================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route definitions
    const routes = {
      '/': 'login.html',
      '/login': 'login.html',
      '/admin': 'admin.html',
      '/dashboard': 'dashboard.html',
      '/triage': 'triage.html',
    };

    // Determine which file to serve
    const fileName = routes[path] || routes['/'];

    try {
      // Fetch the HTML file from your Worker's assets
      const html = await getAsset(fileName);
      
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-cache'
        },
      });
    } catch (error) {
      return new Response(`File not found: ${fileName}`, { status: 404 });
    }
  },
};

// ==========================================
// HELPER: Get HTML file content
// ==========================================
async function getAsset(fileName) {
  // For Workers, you need to import the files
  // This is a simplified version - see note below about Workers Sites
  const files = {
    'login.html': await import('./login.html?raw'),
    'admin.html': await import('./admin.html?raw'),
    'dashboard.html': await import('./dashboard.html?raw'),
    'triage.html': await import('./triage.html?raw'),
    'style.css': await import('./style.css?raw'),
  };

  return files[fileName]?.default || null;
}
