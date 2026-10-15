import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './src/server/apiRouter';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', apiRouter);

// Serve public and static build assets
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

app.get('/standalone', (_req, res) => {
  res.sendFile(path.join(publicPath, 'standalone.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Logistics Invoice Validator running on http://0.0.0.0:${port}`);
});
