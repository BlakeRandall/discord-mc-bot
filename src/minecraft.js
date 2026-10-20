
const config = require('./config');

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const UUID_RE =
  /^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

const MOJANG_PROFILE_URL =
  'https://api.mojang.com/users/profiles/minecraft/';

const MOJANG_TIMEOUT_MS = 8000;

function isValidUsername(name) {
  return typeof name === 'string' && USERNAME_RE.test(name);
}

function normalizeUuid(uuid) {
  if (typeof uuid !== 'string') {
    throw new TypeError('UUID must be a string.');
  }

  const normalized = uuid.replace(/-/g, '').toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new TypeError('Invalid Minecraft UUID.');
  }

  return normalized;
}

function dash(uuid) {
  const value = normalizeUuid(uuid);

  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join('-');
}

function undash(uuid) {
  return normalizeUuid(uuid);
}

// UUID representation used when storing new whitelist records.
function formatUuid(uuid) {
  return config.uuidFormat === 'dashed'
    ? dash(uuid)
    : undash(uuid);
}

// Match existing records regardless of UUID storage format.
function uuidVariants(uuid) {
  const normalized = normalizeUuid(uuid);

  return [
    dash(normalized),
    normalized,
  ];
}

/**
 * Look up a Minecraft Java Edition profile.
 *
 * Returns { username, uuid } when found, or null when the
 * username does not exist.
 *
 * Throws for network failures, timeouts, and unexpected API responses.
 */
async function lookupProfile(username) {
  if (!isValidUsername(username)) {
    return null;
  }

  const url =
    MOJANG_PROFILE_URL + encodeURIComponent(username);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(MOJANG_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 204 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Mojang API returned HTTP ${response.status}.`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('Mojang API returned invalid JSON.');
  }

  if (
    !data ||
    typeof data.id !== 'string' ||
    typeof data.name !== 'string'
  ) {
    throw new Error(
      'Mojang API returned an invalid profile response.'
    );
  }

  let uuid;

  try {
    uuid = formatUuid(data.id);
  } catch {
    throw new Error(
      'Mojang API returned an invalid Minecraft UUID.'
    );
  }

  if (!isValidUsername(data.name)) {
    throw new Error(
      'Mojang API returned an invalid Minecraft username.'
    );
  }

  return {
    username: data.name,
    uuid,
  };
}

module.exports = {
  isValidUsername,
  lookupProfile,
  uuidVariants,
  formatUuid,
};
