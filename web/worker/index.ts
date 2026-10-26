import handler from 'vinext/server/fetch-handler';
import { openLiveRoom } from '../lib/live-room';
export { RoomLive } from '../lib/live-room';

// Entrada do Worker na Cloudflare: /api/live (WebSocket da sala ao vivo) vai para o Durable Object
// da sala; todo o resto (site, jogo e as outras rotas /api) segue para o app (vinext).
const worker = {
 async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
  if (new URL(request.url).pathname === '/api/live') return openLiveRoom(request, env.LIVE);
  return handler.fetch(request, env, ctx);
 },
};
export default worker;
