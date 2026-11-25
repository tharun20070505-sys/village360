import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{port:5174,proxy:{'/api':'http://127.0.0.1:8000'}},build:{rollupOptions:{output:{manualChunks:{charts:['recharts'],motion:['framer-motion'],react:['react','react-dom','react-router-dom']}}}}});
