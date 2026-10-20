const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  MessageFlags,
  Events,
} = require('discord.js');

const config = require('./config');
const db = require('./database');
const repo = require('./whitelistRepository');
const whitelist = require('./commands/whitelist');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = new Map([
  [whitelist.data.name, whitelist],
]);

const ephemeral = (content) => ({
  content,
  flags: MessageFlags.Ephemeral,
});

/**
 * Handle registered slash commands.
 */
async function handleCommand(interaction) {
  const command = commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(
      `Command ${interaction.commandName} failed:`,
      err
    );

    const payload = ephemeral(
      'Something went wrong. Please try again.'
    );

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

/**
 * Check whether the interacting member has the configured staff role.
 *
 * The role must already exist. This function never creates roles.
 */
async function isStaffMember(interaction) {
  if (!interaction.inGuild() || !interaction.guild) {
    return false;
  }

  const guild = interaction.guild;
  const roleName = config.staffRoleName;

  if (!roleName) {
    console.error(
      'STAFF_ROLE_NAME is missing from src/config.js or the environment.'
    );

    return false;
  }

  const roles = await guild.roles.fetch();

  const staffRole = roles.find(
    (role) => role.name === roleName
  );

  if (!staffRole) {
    console.error(
      `Staff role "${roleName}" does not exist in guild ${guild.id}.`
    );

    return false;
  }

  const member = await guild.members.fetch(
    interaction.user.id
  );

  return member.roles.cache.has(staffRole.id);
}

/**
 * Handle Approve and Deny buttons.
 */
async function handleButton(interaction) {
  const [prefix, action, requestId] =
    interaction.customId.split(':');

  if (
    prefix !== 'wl' ||
    !['approve', 'deny'].includes(action) ||
    !requestId
  ) {
    return;
  }

  let authorized;

  try {
    authorized = await isStaffMember(interaction);
  } catch (err) {
    console.error(
      'Staff authorization check failed:',
      err
    );

    return interaction.reply(
      ephemeral(
        'Could not verify your staff permissions. Please try again.'
      )
    );
  }

  if (!authorized) {
    return interaction.reply(
      ephemeral(
        `You cannot review this request. ` +
        `The required staff role is "${config.staffRoleName}". ` +
        'Contact a server administrator if you believe this is an error.'
      )
    );
  }

  await interaction.deferUpdate();

  const approve = action === 'approve';

  let result;

  try {
    result = await repo.decide({
      requestId,
      approve,
      reviewerId: interaction.user.id,
    });
  } catch (err) {
    console.error('Whitelist decision failed:', err);

    return interaction.followUp(
      ephemeral(
        'Database error: the decision was not saved. Please try again.'
      )
    );
  }

  if (result.status === 'not_found') {
    return interaction.followUp(
      ephemeral('This whitelist request no longer exists.')
    );
  }

  if (result.status === 'already_decided') {
    return interaction.followUp(
      ephemeral(
        `This request was already ${result.request.status}.`
      )
    );
  }

  const req = result.request;

  const cleanupTime = req.cleanupAt
    ? new Date(req.cleanupAt).getTime()
    : Date.now() + config.channelDeleteDelayMs;

  const deleteAt = Math.floor(cleanupTime / 1000);

  const originalEmbed = interaction.message.embeds[0];

  if (originalEmbed) {
    const embed = EmbedBuilder.from(originalEmbed)
      .setColor(approve ? 0x2ecc71 : 0xe74c3c)
      .setFields(
        {
          name: 'Minecraft Username',
          value: req.username,
          inline: true,
        },
        {
          name: 'UUID',
          value: `\`${req.uuid}\``,
          inline: true,
        },
        {
          name: 'Requested by',
          value: `<@${req.discordUserId}>`,
        },
        {
          name: 'Status',
          value: approve ? 'Approved' : 'Denied',
          inline: true,
        },
        {
          name: 'Reviewed by',
          value: `<@${interaction.user.id}>`,
          inline: true,
        }
      );

    await interaction.editReply({
      embeds: [embed],
      components: [],
    }).catch((err) => {
      console.error('Failed to update request message:', err);
    });
  } else {
    console.error(
      `Request ${requestId} has no embed to update.`
    );
  }

  await interaction.channel?.send({
    content:
      `Request ${approve ? 'approved' : 'denied'}. ` +
      `This channel will be deleted <t:${deleteAt}:R>.`,
    allowedMentions: {
      parse: [],
    },
  }).catch((err) => {
    console.error('Failed to send decision notification:', err);
  });

  try {
    const user = await client.users.fetch(
      req.discordUserId
    );

    await user.send(
      approve
        ? `Your whitelist request for **${req.username}** was approved. See you in game!`
        : `Your whitelist request for **${req.username}** was denied. Contact staff if you think this is a mistake.`
    );
  } catch (err) {
    console.error(
      `Could not DM requester ${req.discordUserId}:`,
      err.message
    );

    await interaction.channel?.send({
      content:
        `<@${req.discordUserId}> I couldn't DM you. ` +
        'Please check the decision above.',
      allowedMentions: {
        users: [req.discordUserId],
      },
    }).catch(() => {});
  }
}

/**
 * Dispatch Discord interactions.
 */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (err) {
    console.error('Interaction handling failed:', err);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply(
        ephemeral(
          'An unexpected error occurred. Please try again.'
        )
      ).catch(() => {});
    }
  }
});

/**
 * Find completed request channels that are due for deletion.
 * Cleanup can resume after a bot restart.
 */
let sweeping = false;

async function sweepChannels() {
  if (sweeping) return;

  sweeping = true;

  try {
    const due = await repo.findDueForCleanup();

    for (const req of due) {
      try {
        const channel = await client.channels
          .fetch(req.channelId)
          .catch((err) => {
            // Discord error 10003: Unknown Channel.
            if (err.code === 10003) {
              return null;
            }

            throw err;
          });

        if (channel) {
          await channel.delete(
            'Whitelist request completed'
          );
        }

        await repo.markChannelDeleted(req.requestId);
      } catch (err) {
        console.error(
          `Cleanup failed for request ${req.requestId}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error('Channel cleanup sweep failed:', err);
  } finally {
    sweeping = false;
  }
}

/**
 * Start cleanup once Discord is ready.
 */
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  sweepChannels();

  setInterval(sweepChannels, 30 * 1000);
});

/**
 * Connect to MongoDB and log in to Discord.
 * Slash commands are deployed separately.
 */
(async () => {
  await db.connect();
  await client.login(config.discordToken);
})().catch((err) => {
  console.error('Bot startup failed:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});