declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    // Sala ao vivo (lib/live-room.ts): um Durable Object por sala.
    LIVE?: DurableObjectNamespace;
    BUCKET?: R2Bucket;
  }
}
