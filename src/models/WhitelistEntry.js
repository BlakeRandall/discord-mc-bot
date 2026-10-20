
class WhitelistEntry {
  constructor(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError(
        'WhitelistEntry data must be an object.'
      );
    }

    if (
      typeof data.uuid !== 'string' ||
      !data.uuid.trim()
    ) {
      throw new TypeError(
        'WhitelistEntry.uuid must be a non-empty string.'
      );
    }

    if (
      typeof data.username !== 'string' ||
      !data.username.trim()
    ) {
      throw new TypeError(
        'WhitelistEntry.username must be a non-empty string.'
      );
    }

    if (typeof data.active !== 'boolean') {
      throw new TypeError(
        'WhitelistEntry.active must be a boolean.'
      );
    }

    this.uuid = data.uuid;
    this.username = data.username;
    this.active = data.active;

    if (data.changeSource !== undefined) {
      this.changeSource = data.changeSource;
    }

    if (data.changedBy !== undefined) {
      this.changedBy = data.changedBy;
    }

    if (data.updatedAt !== undefined) {
      const updatedAt = new Date(data.updatedAt);

      if (Number.isNaN(updatedAt.getTime())) {
        throw new TypeError(
          'WhitelistEntry.updatedAt must be a valid date.'
        );
      }

      this.updatedAt = updatedAt;
    }

    if (data.revision !== undefined) {
      if (
        !Number.isSafeInteger(data.revision) ||
        data.revision < 0
      ) {
        throw new TypeError(
          'WhitelistEntry.revision must be a non-negative integer.'
        );
      }

      this.revision = data.revision;
    }
  }

  toDocument() {
    return { ...this };
  }

  static fromDocument(document) {
    return document ? new WhitelistEntry(document) : null;
  }
}

module.exports = WhitelistEntry;
