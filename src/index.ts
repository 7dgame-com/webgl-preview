import 'dotenv/config';
import app from './app';
import { HOST, PORT } from './config';

app.listen(PORT, HOST, () => {
  console.info(`webgl-preview listening on http://${HOST}:${PORT}`);
});
