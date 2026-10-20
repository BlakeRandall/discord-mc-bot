
require('dotenv').config();

const required = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'GUILD_ID',
  'SERVICE_UUID',
  'MONGODB_URI',
  'MONGODB_DATABASE',
];

const missing = required.filter(
  (key) => !process.env[key] || !process.env[key].trim()
);

if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
  process.exit(1);
}

const delayMinutes = Number(
  process.env.CHANNEL_DELETE_DELAY_MINUTES || 10
);

const uuidFormat = (
  process.env.UUID_FORMAT || 'dashed'
).toLowerCase();

if (!['dashed', 'undashed'].includes(uuidFormat)) {
  console.error('UUID_FORMAT must be "dashed" or "undashed".');
  process.exit(1);
}

if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
  console.error(
    'CHANNEL_DELETE_DELAY_MINUTES must be a positive number.'
  );
  process.exit(1);
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,

  staffRoleName: process.env.STAFF_ROLE_NAME || 'Whitelist Staff',

  serviceUuid: process.env.SERVICE_UUID,

  mongoUri: process.env.MONGODB_URI,
  mongoDatabase: process.env.MONGODB_DATABASE,

  whitelistCollection: process.env.WHITELIST_COLLECTION || 'whitelist',

  requestsCollection: process.env.REQUESTS_COLLECTION || 'whitelist_requests',

  ticketCategoryId: process.env.TICKET_CATEGORY_ID || null,

  channelDeleteDelayMs: delayMinutes * 60 * 1000,

  uuidFormat,
};
