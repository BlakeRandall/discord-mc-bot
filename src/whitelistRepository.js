
const { client, getDb } = require('./database');
const config = require('./config');
const { uuidVariants } = require('./minecraft');

const WhitelistRequest = require('./models/WhitelistRequest');
const WhitelistEntry = require('./models/WhitelistEntry');

const requestsCol = () =>
  getDb().collection(config.requestsCollection);

const whitelistCol = () =>
  getDb().collection(config.whitelistCollection);

async function createRequest(data) {
  const request = new WhitelistRequest(data);

  await requestsCol().insertOne(request.toDocument());

  return request;
}

async function setRequestMessage(requestId, messageId) {
  await requestsCol().updateOne(
    { requestId },
    { $set: { messageId } }
  );
}

async function deleteRequest(requestId) {
  await requestsCol().deleteOne({ requestId });
}

async function getRequest(requestId) {
  const document = await requestsCol().findOne({ requestId });

  return WhitelistRequest.fromDocument(document);
}

async function findPendingForUser(discordUserId) {
  const document = await requestsCol().findOne({
    discordUserId,
    status: 'pending',
  });

  return WhitelistRequest.fromDocument(document);
}

async function findPendingForUuid(uuid) {
  const document = await requestsCol().findOne({
    uuid: { $in: uuidVariants(uuid) },
    status: 'pending',
  });

  return WhitelistRequest.fromDocument(document);
}

async function findWhitelistEntry(uuid) {
  const document = await whitelistCol().findOne({
    uuid: { $in: uuidVariants(uuid) },
  });

  return WhitelistEntry.fromDocument(document);
}

/**
 * Atomically records a decision and updates the whitelist entry.
 *
 * Returns:
 *   { status: 'decided', request }
 *   { status: 'already_decided', request }
 *   { status: 'not_found' }
 *
 * Requires MongoDB transaction support.
 */
async function decide({ requestId, approve, reviewerId }) {
  const session = client.startSession();

  let outcome = { status: 'not_found' };

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      const newStatus = approve ? 'approved' : 'denied';

      const updated = await requestsCol().findOneAndUpdate(
        { requestId, status: 'pending' },
        {
          $set: {
            status: newStatus,
            reviewerId,
            decidedAt: now,
            cleanupAt: new Date(
              now.getTime() + config.channelDeleteDelayMs
            ),
            channelDeleted: false,
          },
        },
        {
          session,
          returnDocument: 'after',
        }
      );

      if (!updated) {
        const existing = await requestsCol().findOne(
          { requestId },
          { session }
        );

        outcome = existing
          ? {
              status: 'already_decided',
              request: WhitelistRequest.fromDocument(existing),
            }
          : { status: 'not_found' };

        return;
      }

      const entry = new WhitelistEntry({
        uuid: updated.uuid,
        username: updated.username,
        active: approve,
        changeSource: 'local-change',
        changedBy: config.serviceUuid,
        updatedAt: now,
      });

      await whitelistCol().updateOne(
        { uuid: { $in: uuidVariants(updated.uuid) } },
        {
          $set: {
            username: entry.username,
            active: entry.active,
            changeSource: entry.changeSource,
            changedBy: entry.changedBy,
            updatedAt: entry.updatedAt,
          },
          $inc: { revision: 1 },
          $setOnInsert: { uuid: entry.uuid },
        },
        {
          session,
          upsert: true,
        }
      );

      outcome = {
        status: 'decided',
        request: WhitelistRequest.fromDocument(updated),
      };
    });
  } finally {
    await session.endSession();
  }

  return outcome;
}

async function findDueForCleanup(limit = 25) {
  const documents = await requestsCol()
    .find({
      status: { $in: ['approved', 'denied'] },
      channelDeleted: { $ne: true },
      cleanupAt: { $lte: new Date() },
    })
    .limit(limit)
    .toArray();

  return documents.map((document) =>
    WhitelistRequest.fromDocument(document)
  );
}

async function markChannelDeleted(requestId) {
  await requestsCol().updateOne(
    { requestId },
    { $set: { channelDeleted: true } }
  );
}

module.exports = {
  createRequest,
  setRequestMessage,
  deleteRequest,
  getRequest,
  findPendingForUser,
  findPendingForUuid,
  findWhitelistEntry,
  decide,
  findDueForCleanup,
  markChannelDeleted,
};
