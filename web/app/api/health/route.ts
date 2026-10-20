export function GET(){return Response.json({ok:true,service:'retro-royale',time:Date.now()},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate','X-Content-Type-Options':'nosniff'}});}
