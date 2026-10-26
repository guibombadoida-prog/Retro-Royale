import { getRoomDb } from '@/db';

/* Sala ao vivo: um Durable Object por sala repassa as mensagens da partida por WebSocket.
   Quando a ligação direta entre os aparelhos (WebRTC) não abre — comum em rede móvel —, a partida
   passa por aqui em vez de consultar o banco D1 a cada atualização. O Durable Object nasce perto de
   quem abriu a sala, então o caminho é curto para jogadores da mesma região.
   O anfitrião continua sendo a autoridade: ele valida toda jogada que chega (como no WebRTC). */
export const LIVE_PROTOCOL = 'rr-live';
// O pacote do anfitrião fica em ~5 a 10 KB a 15 por segundo; o convidado só manda jogadas e ping.
const MAX_HOST_MESSAGE = 65536, MAX_GUEST_MESSAGE = 2048, HOST_PER_SECOND = 45, GUEST_PER_SECOND = 20;

async function hash(token: string) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map(x => x.toString(16).padStart(2, '0')).join('');
}

// Worker: confere quem é o jogador (token da sala no Sec-WebSocket-Protocol, fora da URL) e entrega a
// conexão ao Durable Object da sala com o lugar (slot) dele.
export async function openLiveRoom(request: Request, live: DurableObjectNamespace | undefined): Promise<Response> {
 if (!live) return new Response('Sala ao vivo indisponível.', { status: 503 });
 if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Use WebSocket.', { status: 426 });
 const url = new URL(request.url), origin = request.headers.get('Origin');
 if (origin && origin !== url.origin) return new Response('Origem inválida.', { status: 403 });
 const code = url.searchParams.get('code') || '';
 const [protocol, token = ''] = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim());
 if (protocol !== LIVE_PROTOCOL || !/^[A-Z2-9]{6}$/.test(code) || !/^[0-9a-f-]{72}$/.test(token)) return new Response('Entre novamente na sala.', { status: 401 });
 const player = await getRoomDb().prepare("SELECT p.slot AS slot FROM room_players p JOIN team_rooms r ON r.code=p.code WHERE p.code=? AND p.token_hash=? AND r.expires>? AND r.status!='closed'")
  .bind(code, await hash(token), Date.now()).first<{ slot: number }>();
 if (!player) return new Response('Acesso à sala recusado.', { status: 403 });
 const headers = new Headers(request.headers);headers.set('X-Live-Slot', String(player.slot));
 return live.get(live.idFromName(code)).fetch(new Request(request, { headers }));
}

type Limit = { at: number; count: number };
// Durable Object (classe exportada pelo worker/index.ts). Usa a API de WebSocket com hibernação:
// parado no lobby ele não gasta nada; numa partida só repassa texto.
export class RoomLive {
 private limits = new Map<WebSocket, Limit>();
 constructor(private state: DurableObjectState) {}

 async fetch(request: Request): Promise<Response> {
  const slot = Number(request.headers.get('X-Live-Slot'));
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return new Response('Jogador inválido.', { status: 400 });
  // Reconexão do mesmo jogador substitui a anterior.
  for (const old of this.state.getWebSockets(String(slot))) try { old.close(4001, 'Conectado de novo.'); } catch { /* já fechado */ }
  const pair = new WebSocketPair(), [client, server] = Object.values(pair);
  this.state.acceptWebSocket(server, [String(slot)]);
  server.serializeAttachment({ slot });
  this.roster();
  return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': LIVE_PROTOCOL } });
 }

 webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
  const slot = this.slotOf(ws);
  if (typeof message !== 'string' || slot < 0 || !this.allow(ws, slot === 0 ? HOST_PER_SECOND : GUEST_PER_SECOND)) return;
  if (slot === 0) {
   // Anfitrião → convidados. Uma mensagem que começa com {"to":N vai só para o jogador N.
   if (message.length > MAX_HOST_MESSAGE) return;
   const to = message.startsWith('{"to":') ? Number.parseInt(message.slice(6), 10) : -1;
   for (const peer of this.state.getWebSockets()) {
    if (peer === ws || (to >= 0 && this.slotOf(peer) !== to)) continue;
    try { peer.send(message); } catch { /* conexão caindo */ }
   }
   return;
  }
  // Convidado → anfitrião, com o remetente carimbado aqui (ninguém se passa por outro jogador).
  if (message.length > MAX_GUEST_MESSAGE) return;
  let data: unknown;
  try { data = JSON.parse(message); } catch { return; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const out = JSON.stringify({ ...data, from: slot });
  for (const host of this.state.getWebSockets('0')) try { host.send(out); } catch { /* conexão caindo */ }
 }

 webSocketClose(ws: WebSocket) { this.limits.delete(ws); this.roster(ws); }
 webSocketError(ws: WebSocket) { this.limits.delete(ws); this.roster(ws); }

 private slotOf(ws: WebSocket) {
  const value = (ws.deserializeAttachment() as { slot?: unknown } | null)?.slot;
  return Number.isInteger(value) ? value as number : -1;
 }
 // Limite simples por conexão (mensagens por segundo) contra inundação.
 private allow(ws: WebSocket, perSecond: number) {
  const now = Date.now(), limit = this.limits.get(ws);
  if (!limit || now - limit.at >= 1000) { this.limits.set(ws, { at: now, count: 1 }); return true; }
  return ++limit.count <= perSecond;
 }
 // Avisa todos de quem está conectado ao vivo (o anfitrião usa para saber quem recebe por aqui).
 private roster(closing?: WebSocket) {
  const sockets = this.state.getWebSockets().filter(ws => ws !== closing);
  const message = JSON.stringify({ type: 'roster', slots: [...new Set(sockets.map(ws => this.slotOf(ws)).filter(s => s >= 0))] });
  for (const ws of sockets) try { ws.send(message); } catch { /* conexão caindo */ }
 }
}
