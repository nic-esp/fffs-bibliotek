import { createFetchHandler } from '../adapter.js';

export default { fetch: createFetchHandler('/health') };
