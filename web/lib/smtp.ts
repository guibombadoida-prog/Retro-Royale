import { connect } from 'cloudflare:sockets';

/* Envio de e-mail por SMTP direto do Worker (sockets TCP da Cloudflare), usado para mandar o código de
   login pela conta Gmail do jogo com uma "senha de app". Conexão TLS na porta 465 (implícita), AUTH PLAIN,
   uma mensagem por conexão. Sem dependências: o protocolo é curto e fica coberto pelo account.test. */
export type Mail = { from: string; user: string; password: string; to: string; subject: string; text: string; html: string };
type Open = typeof connect;
export class SmtpError extends Error { constructor(public code: number, reply: string) { super('SMTP ' + code + ': ' + reply.slice(0, 200)); } }

const encoder = new TextEncoder();
// Base64 de texto UTF-8 (o btoa só aceita bytes).
const base64 = (text: string) => { let s = ''; for (const b of encoder.encode(text)) s += String.fromCharCode(b); return btoa(s); };
const wrap = (text: string) => text.replace(/.{1,76}/g, '$&\r\n');
// Nada de quebra de linha vindo de fora nos cabeçalhos (impede injetar outro destinatário).
const header = (text: string) => { if (/[\r\n]/.test(text)) throw new Error('Cabeçalho inválido'); return text; };

export function buildMessage(mail: Mail, now = new Date()) {
 const boundary = 'rr-' + crypto.randomUUID();
 return [
  'From: ' + header(mail.from), 'To: <' + header(mail.to) + '>', 'Subject: =?UTF-8?B?' + base64(mail.subject) + '?=',
  'Date: ' + now.toUTCString(), 'Message-ID: <' + crypto.randomUUID() + '@retro-royale>', 'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="' + boundary + '"', '',
  '--' + boundary, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(base64(mail.text)),
  '--' + boundary, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(base64(mail.html)),
  '--' + boundary + '--', ''
 ].join('\r\n');
}

export async function sendMail(mail: Mail, { host = 'smtp.gmail.com', port = 465, timeout = 10000, open = connect as Open } = {}) {
 const socket = open({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false });
 const reader = socket.readable.getReader(), writer = socket.writable.getWriter(), decoder = new TextDecoder();
 const deadline = Date.now() + timeout;
 let buffer = '';
 // Uma resposta pode ter várias linhas ("250-..."); termina na linha "250 ...".
 const reply = async () => {
  for (;;) {
   const lines = buffer.split('\r\n');
   for (let i = 0; i < lines.length - 1; i++) if (/^\d{3}(?: |$)/.test(lines[i])) {
    buffer = lines.slice(i + 1).join('\r\n');
    return { code: Number(lines[i].slice(0, 3)), text: lines.slice(0, i + 1).join('\n') };
   }
   const left = deadline - Date.now();
   if (left <= 0) throw new Error('SMTP sem resposta');
   let timer: ReturnType<typeof setTimeout> | undefined;
   const chunk = await Promise.race([reader.read(), new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error('SMTP sem resposta')), left); })]).finally(() => clearTimeout(timer));
   if (chunk.done) throw new Error('SMTP fechou a conexão');
   buffer += decoder.decode(chunk.value, { stream: true });
   if (buffer.length > 65536) throw new Error('Resposta SMTP grande demais');
  }
 };
 const step = async (line: string | null, expect: number[]) => {
  if (line !== null) await writer.write(encoder.encode(line + '\r\n'));
  const answer = await reply();
  if (!expect.includes(answer.code)) throw new SmtpError(answer.code, answer.text);
 };
 try {
  await step(null, [220]);
  await step('EHLO retro-royale', [250]);
  await step('AUTH PLAIN ' + base64('\0' + mail.user + '\0' + mail.password), [235]);
  await step('MAIL FROM:<' + header(mail.user) + '>', [250]);
  await step('RCPT TO:<' + header(mail.to) + '>', [250, 251]);
  await step('DATA', [354]);
  // As partes vão em base64, então nenhuma linha começa com "." (não precisa de dot-stuffing).
  await step(buildMessage(mail) + '.', [250]);
  await step('QUIT', [221]).catch(() => {});
 } finally {
  try { reader.releaseLock(); writer.releaseLock(); } catch { /* já liberado */ }
  await socket.close().catch(() => {});
 }
}
