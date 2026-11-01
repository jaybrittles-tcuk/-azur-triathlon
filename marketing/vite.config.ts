import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({plugins:[react()],build:{rollupOptions:{input:{main:resolve(__dirname,'index.html'),half:resolve(__dirname,'70-3-coaching.html'),full:resolve(__dirname,'ironman-coaching.html')}}}});
