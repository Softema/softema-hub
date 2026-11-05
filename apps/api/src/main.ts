import { createApp } from './bootstrap';
import { loadConfig } from './config';

const config = loadConfig();
const app = await createApp(config);
app.enableShutdownHooks();
await app.listen(config.API_PORT, config.API_HOST);
console.log(`API běží na http://${config.API_HOST}:${config.API_PORT}`);
