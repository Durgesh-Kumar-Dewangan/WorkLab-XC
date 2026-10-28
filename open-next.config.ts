import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// The web front end on Cloudflare Workers. The Python API runs separately (see DEPLOY.md) and is reached through API_ORIGIN.
export default defineCloudflareConfig();
