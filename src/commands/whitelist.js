const crypto = require('node:crypto');

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const config = require('../config');
const { lookupProfile } = require('../minecraft');
const repo = require('../whitelistRepository');

const data = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Request access to the Minecraft server whitelist')
  .addStringOption((option) =>
    option
      .setName('username')
      .setDescription('Your Minecraft Java username')
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(16)
  );

/**
 * Find the existing staff role configured in config.js.
 * Never create roles automatically.
 */
async function getStaffRole(guild) {
  const roleName = config.staffRoleName;

  if (!roleName) {
    throw new Error(
      'STAFF_ROLE_NAME is missing from the configuration.'
    );
  }

  const roles = await guild.roles.fetch();

  const staffRole = roles.find(
    (role) => role.name === roleName
  );

  if (!staffRole) {
    throw new Error(
      `The configured staff role "${roleName}" does not exist in this server.`
    );
  }

  return staffRole;
}

async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const input = interaction.options
    .getString('username', true)
    .trim();

  const guild = interaction.guild;

  if (!guild) {
    return interaction.editReply(
      'This command must be used in a Discord server.'
    );
  }

  // Validate the configured staff role before processing the request.
  let staffRole;

  try {
    staffRole = await getStaffRole(guild);
  } catch (error) {
    console.error('Staff role validation failed:', error.message);

    return interaction.editReply(
      `Configuration error: ${error.message} ` +
      'Please contact a server administrator.'
    );
  }

  try {
    if (await repo.findPendingForUser(interaction.user.id)) {
      return interaction.editReply(
        'You already have a pending whitelist request. Please wait for staff to review it.'
      );
    }

    let profile;

    try {
      profile = await lookupProfile(input);
    } catch (error) {
      console.error('Minecraft profile lookup failed:', error);

      return interaction.editReply(
        'Could not verify that username with Mojang. Please try again shortly.'
      );
    }

    if (!profile) {
      return interaction.editReply(
        `No Minecraft Java account named **${input}** was found. Check the spelling and try again.`
      );
    }

    if (await repo.findPendingForUuid(profile.uuid)) {
      return interaction.editReply(
        `A request for **${profile.username}** is already pending.`
      );
    }

    const existing = await repo.findWhitelistEntry(profile.uuid);

    if (existing?.active === true) {
      return interaction.editReply(
        `**${profile.username}** is already whitelisted.`
      );
    }

    const requestId = crypto.randomUUID();
    const botId = interaction.client.user.id;

    const channel = await guild.channels.create({
      name: `whitelist-${profile.username}`.toLowerCase(),
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId || undefined,
      topic:
        `Whitelist request for ${profile.username} ` +
        `(requested by ${interaction.user.tag})`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    try {
      await repo.createRequest({
        requestId,
        discordUserId: interaction.user.id,
        discordUserTag: interaction.user.tag,
        username: profile.username,
        uuid: profile.uuid,
        channelId: channel.id,
        messageId: null,
        status: 'pending',
        reviewerId: null,
        createdAt: new Date(),
        decidedAt: null,
        cleanupAt: null,
        channelDeleted: false,
      });

      const embed = new EmbedBuilder()
        .setTitle('Whitelist Request')
        .setColor(0xf1c40f)
        .addFields(
          {
            name: 'Minecraft Username',
            value: profile.username,
            inline: true,
          },
          {
            name: 'UUID',
            value: `\`${profile.uuid}\``,
            inline: true,
          },
          {
            name: 'Requested by',
            value: `<@${interaction.user.id}>`,
          },
          {
            name: 'Status',
            value: 'Pending',
          }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wl:approve:${requestId}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`wl:deny:${requestId}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      );

      const message = await channel.send({
        content:
          `<@&${staffRole.id}> New whitelist request ` +
          `from <@${interaction.user.id}>.`,
        embeds: [embed],
        components: [row],
        allowedMentions: {
          roles: [staffRole.id],
          users: [interaction.user.id],
        },
      });

      await repo.setRequestMessage(requestId, message.id);
    } catch (error) {
      console.error('Whitelist request setup failed:', error);

      await repo.deleteRequest(requestId).catch(() => {});
      await channel.delete('Whitelist request setup failed').catch(() => {});

      return interaction.editReply(
        'Something went wrong creating your request. Please try again.'
      );
    }

    return interaction.editReply(
      `Your whitelist request was submitted successfully: ${channel}`
    );
  } catch (error) {
    console.error('Whitelist command failed:', error);

    return interaction.editReply(
      'An unexpected error occurred while processing your request. Please try again.'
    );
  }
}

module.exports = { data, execute };