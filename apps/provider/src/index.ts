// Provider API - Entry point
// Will be implemented with TDD

import 'dotenv/config';

const PORT = process.env.PROVIDER_PORT || 3001;

console.log(`Provider service starting on port ${PORT}...`);
