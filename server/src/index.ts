import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* ignore */
}
import { loadConfig } from './config';
import { LibraryService } from './library/service';
import http from 'node:http';
import { createApp } from './http/app';
import { attachRealtime } from './realtime/hub';
import { Server as WebSocketServer } from 'ws';
import { WebSocketStreamHandler } from './streaming/websocket-stream-handler';

async function main() {
  const cfg = loadConfig();
  const svc = new LibraryService(cfg);
  await svc.init();

  const { app, adminToken, sessions, progress } = createApp(svc);
  const server = http.createServer(app);
  
  // WebSocket server for screen capture streaming
  const wss = new WebSocketServer({ noServer: true });
  const streamHandlers = new Map<string, WebSocketStreamHandler>();

  // Attach realtime (Socket.IO) first
  const rt = attachRealtime(server, svc, sessions);
  
  // Then override 'upgrade' to handle streaming WebSocket
  const originalUpgrade = server.listeners('upgrade')[0];
  server.removeAllListeners('upgrade');
  
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    
    console.log(`[Server] WebSocket upgrade request: ${url.pathname}`);
    
    // Handle /ws/stream/:roomId endpoint (our custom streaming)
    if (url.pathname.startsWith('/ws/stream/')) {
      const roomId = url.pathname.replace(/^\/ws\/stream\/?/, '').split('/')[0];
      const token = url.searchParams.get('token');
      
      console.log(`[Server] Streaming WebSocket request for room: ${roomId}, has token: ${!!token}`);
      
      if (!roomId) {
        console.error('[Server] Missing roomId');
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      console.log(`[WebSocket] Screen stream connection for room ${roomId}`);

      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log(`[WebSocket] Upgrade successful for room ${roomId}`);
        
        // Stop any previous handler for this room
        const oldHandler = streamHandlers.get(roomId);
        if (oldHandler) {
          try { oldHandler.stop(); } catch { /* ignore */ }
          streamHandlers.delete(roomId);
        }

        const handler = new WebSocketStreamHandler(roomId);
        streamHandlers.set(roomId, handler);
        
        ws.on('close', () => {
          console.log(`[WebSocket] Connection closed for room ${roomId}`);
          handler.stop();
          streamHandlers.delete(roomId);
        });
        
        handler.start(ws);
        
        // Send initial confirmation
        const confirmMsg = JSON.stringify({ type: 'connected', roomId, hlsUrl: handler.getHLSUrl() });
        ws.send(confirmMsg);
        console.log(`[WebSocket] Sent confirmation to client: ${confirmMsg}`);
      });
    } else {
      // Pass to Socket.IO for all other WebSocket paths
      console.log(`[Server] Passing WebSocket to Socket.IO: ${url.pathname}`);
      if (typeof originalUpgrade === 'function') {
        originalUpgrade(request, socket, head);
      }
    }
  });
  
  server.listen(cfg.port, () => {
    console.log(`▶ API listening on http://localhost:${cfg.port}`);
    console.log(`  library: ${svc.store.titles.size} titles / ${svc.store.media.size} files (from last index)`);
    console.log(`  Discord: ${cfg.discord.clientId && cfg.discord.clientSecret ? 'configured' : 'NOT configured (set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)'} · guest rooms: ${cfg.allowGuest ? 'allowed (?room=…)' : 'off'}`);
    console.log(`  TMDB: ${svc.tmdb.enabled ? 'enabled' : 'disabled (set TMDB_API_KEY) → using filenames + data/metadata.json'}`);
    if (!cfg.adminToken) console.log(`  admin token (random this run, set ADMIN_TOKEN to pin it): ${adminToken}`);
  });

  if (cfg.scanOnStart) {
    svc.scan().then(() => {
      const s = svc.status;
      console.log(`✓ scan finished: ${svc.store.titles.size} titles, ${svc.store.media.size} files, ${s.warnings.length} warning(s)`);
    });
  }

  const shutdown = () => {
    svc.hls.shutdown();
    void Promise.all([rt.close(), progress.flush()]).finally(() => server.close(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
