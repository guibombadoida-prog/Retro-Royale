import { defineConfig } from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'public/game',emptyOutDir:false,target:'es2020',minify:true,lib:{entry:'src/game/arena3d.js',name:'RetroArena3D',formats:['iife'],fileName:()=> 'arena3d.bundle.js'}}});
