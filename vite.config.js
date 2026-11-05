import { defineConfig } from 'vite';
export default defineConfig({ root:'web', base:'./', server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:8000'}},preview:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:8000'}},build:{outDir:'../dist',emptyOutDir:true,chunkSizeWarningLimit:800} });
