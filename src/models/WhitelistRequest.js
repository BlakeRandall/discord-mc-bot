
const REQUEST_STATUSES = Object.freeze([
  'pending',
  'approved',
  'denied',
]);

const REQUIRED_STRINGS = [
  'requestId',
  'discordUserId',
  'username',
  'uuid',
  'channelId',
];

function nullableString(value, field) {
  if (value == null) return null;

  if (typeof value !== 'string') {
    throw new TypeError(
      `WhitelistRequest.${field} must be a string or null.`
    );
  }

  return value;
}

function nullableDate(value, field) {
  if (value == null) return null;

  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(
      `WhitelistRequest.${field} must be a valid date or null.`
    );
  }

  return date;
}

class WhitelistRequest {
  constructor(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError(
        'WhitelistRequest data must be an object.'
      );
    }

    for (const field of REQUIRED_STRINGS) {
      if (
        typeof data[field] !== 'string' ||
        !data[field].trim()
      ) {
        throw new TypeError(
          `WhitelistRequest.${field} must be a non-empty string.`
        );
      }
    }

    const status = data.status ?? 'pending';

    if (!REQUEST_STATUSES.includes(status)) {
      throw new TypeError(
        `WhitelistRequest.status must be one of: ${REQUEST_STATUSES.join(', ')}.`
      );
    }

    this.requestId = data.requestId;
    this.discordUserId = data.discordUserId;
    this.discordUserTag = nullableString(
      data.discordUserTag,
      'discordUserTag'
    );

    this.username = data.username;
    this.uuid = data.uuid;
    this.channelId = data.channelId;

    this.messageId = nullableString(
      data.messageId,
      'messageId'
    );

    this.status = status;

    this.reviewerId = nullableString(
      data.reviewerId,
      'reviewerId'
    );

    this.createdAt = nullableDate(
      data.createdAt ?? new Date(),
      'createdAt'
    );

    this.decidedAt = nullableDate(
      data.decidedAt,
      'decidedAt'
    );

    this.cleanupAt = nullableDate(
      data.cleanupAt,
      'cleanupAt'
    );

    if (
      data.channelDeleted !== undefined &&
      typeof data.channelDeleted !== 'boolean'
    ) {
      throw new TypeError(
        'WhitelistRequest.channelDeleted must be a boolean.'
      );
    }

    this.channelDeleted = data.channelDeleted ?? false;
  }

  toDocument() {
    return { ...this };
  }

  static fromDocument(document) {
    return document ? new WhitelistRequest(document) : null;
  }
}

WhitelistRequest.STATUSES = REQUEST_STATUSES;

module.exports = WhitelistRequest;
