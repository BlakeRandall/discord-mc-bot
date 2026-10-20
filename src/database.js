
const { MongoClient } = require('mongodb');
const config = require('./config');

const client = new MongoClient(config.mongoUri);

let db;

async function connect() {
  await client.connect();
  db = client.db(config.mongoDatabase);

  const requests = db.collection(config.requestsCollection);

  await requests.createIndex(
    { requestId: 1 },
    { unique: true, name: 'uniq_request_id' }
  );

  await requests.createIndex({ channelId: 1 });
  await requests.createIndex({ status: 1, cleanupAt: 1 });
  await requests.createIndex({ discordUserId: 1, status: 1 });
  await requests.createIndex({ uuid: 1, status: 1 });

  await ensureWhitelistUuidIndex();

  console.log('MongoDB connected.');
}

async function ensureWhitelistUuidIndex() {
  const whitelist = db.collection(config.whitelistCollection);

  const duplicates = await whitelist.aggregate([
    { $match: { uuid: { $type: 'string' } } },
    { $group: { _id: '$uuid', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]).toArray();

  if (duplicates.length > 0) {
    const examples = duplicates
      .map((document) => document._id)
      .join(', ');

    throw new Error(
      `Duplicate UUIDs found in "${config.whitelistCollection}" ` +
      `(examples: ${examples}). Resolve these duplicates before starting.`
    );
  }

  await whitelist.createIndex(
    { uuid: 1 },
    {
      unique: true,
      name: 'uniq_whitelist_uuid',
      partialFilterExpression: {
        uuid: { $type: 'string' },
      },
    }
  );
}

function getDb() {
  if (!db) {
    throw new Error('Database not connected');
  }

  return db;
}

module.exports = {
  client,
  connect,
  getDb,
};
