require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { LavalinkManager } = require('lavalink-client');

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  WELCOME_CHANNEL_ID,
  WELCOME_GIF_URL,
  LAVALINK_HOST = 'localhost',
  LAVALINK_PORT = '2333',
  LAVALINK_PASSWORD
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  throw new Error('Isi DISCORD_TOKEN dan CLIENT_ID di environment hosting/.env.');
}
if (!LAVALINK_PASSWORD) {
  throw new Error('Isi LAVALINK_PASSWORD sesuai password di lavalink/application.yml.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.lavalink = new LavalinkManager({
  nodes: [{
    id: 'kanzt-main',
    host: LAVALINK_HOST,
    port: Number(LAVALINK_PORT),
    authorization: LAVALINK_PASSWORD,
    secure: false,
    retryAmount: 10,
    retryDelay: 5000
  }],
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
  autoSkip: true,
  client: {
    id: CLIENT_ID,
    username: 'Kanzt Welcome Music'
  },
  playerOptions: {
    defaultSearchPlatform: 'ytmsearch',
    volumeDecrementer: 1,
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false
    },
    onEmptyQueue: {
      destroyAfterMs: 60_000
    },
    useUnresolvedData: true
  },
  queueOptions: {
    maxPreviousTracks: 10
  }
});

client.on('raw', data => client.lavalink.sendRawData(data));

client.once(Events.ClientReady, async readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  try {
    await client.lavalink.init({
      id: readyClient.user.id,
      username: readyClient.user.username
    });
    console.log('Lavalink initialized. Welcome + music features are ready.');
  } catch (error) {
    console.error('Lavalink initialization failed:', error);
  }
});

client.on(Events.GuildMemberAdd, async member => {
  if (!WELCOME_CHANNEL_ID || !WELCOME_GIF_URL) return;

  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.send) {
      console.error('Welcome channel not found or is not a text channel.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(process.env.WELCOME_COLOR || '#e63946')
      .setTitle(process.env.WELCOME_TITLE || 'WELCOME TO THE SERVER')
      .setDescription(
        `Welcome ${member} to **${member.guild.name}**!\n` +
        `You're member **#${member.guild.memberCount.toLocaleString('en-US')}**. Enjoy your stay!`
      )
      .setImage(WELCOME_GIF_URL)
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `Member ID: ${member.id}` })
      .setTimestamp();

    await channel.send({
      content: `Welcome to the server, ${member}!`,
      embeds: [embed],
      allowedMentions: { users: [member.id] }
    });
    console.log(`Welcomed ${member.user.tag}`);
  } catch (error) {
    console.error('Welcome message failed:', error);
  }
});

function getPlayer(guildId) {
  return client.lavalink.getPlayer(guildId);
}

function userVoiceChannel(interaction) {
  return interaction.member?.voice?.channel;
}

function makeMusicButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_resume').setLabel('Resume').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music_stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
  );
}

function trackTitle(track) {
  return track?.info?.title || 'Unknown track';
}

function currentTrack(player) {
  return player?.queue?.current || null;
}

function canControlPlayer(interaction, player) {
  const voice = userVoiceChannel(interaction);
  if (!voice) return 'Masuk voice channel dulu, bro.';
  if (!player) return 'Belum ada musik yang diputar.';
  if (player.voiceChannelId && player.voiceChannelId !== voice.id) {
    return 'Masuk ke voice channel yang sama dengan bot dulu.';
  }
  return null;
}

async function ensurePlayer(interaction) {
  const voice = userVoiceChannel(interaction);
  if (!voice) throw new Error('Masuk voice channel dulu sebelum memakai /play.');

  let player = getPlayer(interaction.guildId);
  if (!player) {
    player = await client.lavalink.createPlayer({
      guildId: interaction.guildId,
      voiceChannelId: voice.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
      volume: 70
    });
  } else if (player.voiceChannelId !== voice.id) {
    throw new Error('Bot sudah dipakai di voice channel lain. Gunakan /leave dulu atau masuk ke channel bot.');
  }

  if (!player.connected) await player.connect();
  return player;
}

async function handlePlay(interaction) {
  await interaction.deferReply();
  const query = interaction.options.getString('query', true);

  const player = await ensurePlayer(interaction);
  const result = await player.search({ query }, interaction.user);

  if (!result || !result.tracks || result.tracks.length === 0) {
    return interaction.editReply('Lagu tidak ditemukan atau sumbernya sedang tidak tersedia. Coba link lain.');
  }

  // A URL may resolve to a track or a playlist. Queue all returned tracks up to a safe limit.
  const tracks = result.tracks.slice(0, 100);
  await player.queue.add(tracks);
  if (!player.playing && !player.paused) await player.play();

  const first = tracks[0];
  const playlistName = result.playlist?.name;
  const embed = new EmbedBuilder()
    .setColor('#e63946')
    .setTitle('🎵 Ditambahkan ke antrean')
    .setDescription(
      `${playlistName ? `Playlist **${playlistName}**` : `**${trackTitle(first)}**`}\n` +
      `Jumlah track ditambahkan: **${tracks.length}**\n` +
      `Diminta oleh: ${interaction.user}`
    );

  if (first?.info?.uri) embed.setURL(first.info.uri);
  if (first?.info?.artworkUrl) embed.setThumbnail(first.info.artworkUrl);
  await interaction.editReply({ embeds: [embed], components: [makeMusicButtons()] });
}

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      const player = getPlayer(interaction.guildId);
      const error = canControlPlayer(interaction, player);
      if (error) return interaction.reply({ content: error, ephemeral: true });

      if (interaction.customId === 'music_pause') {
        await player.pause();
        return interaction.reply({ content: '⏸️ Musik dijeda.', ephemeral: true });
      }
      if (interaction.customId === 'music_resume') {
        await player.resume();
        return interaction.reply({ content: '▶️ Musik dilanjutkan.', ephemeral: true });
      }
      if (interaction.customId === 'music_skip') {
        await player.skip();
        return interaction.reply({ content: '⏭️ Lagu dilewati.', ephemeral: true });
      }
      if (interaction.customId === 'music_stop') {
        await player.stopPlaying();
        player.queue.clear();
        return interaction.reply({ content: '⏹️ Musik dihentikan dan antrean dikosongkan.', ephemeral: true });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Command ini hanya bisa dipakai di server Discord.', ephemeral: true });
    }

    const name = interaction.commandName;

    if (name === 'play') return await handlePlay(interaction);

    const player = getPlayer(interaction.guildId);

    if (name === 'queue') {
      const current = currentTrack(player);
      const tracks = player?.queue?.tracks || [];
      if (!current && tracks.length === 0) {
        return interaction.reply({ content: 'Antrean masih kosong. Pakai `/play` buat mulai.', ephemeral: true });
      }
      const upcoming = tracks.slice(0, 10).map((track, index) =>
        `**${index + 1}.** ${trackTitle(track)}`
      ).join('\n') || 'Tidak ada lagu berikutnya.';
      const embed = new EmbedBuilder()
        .setColor('#e63946')
        .setTitle('🎶 Antrean Musik')
        .setDescription(
          `**Sedang diputar:** ${current ? trackTitle(current) : 'Belum ada'}\n\n` +
          `**Berikutnya:**\n${upcoming}`
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (name === 'nowplaying') {
      const current = currentTrack(player);
      if (!current) return interaction.reply({ content: 'Tidak ada lagu yang sedang diputar.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor('#e63946')
        .setTitle('🎧 Now Playing')
        .setDescription(`**${trackTitle(current)}**`);
      if (current.info.uri) embed.setURL(current.info.uri);
      if (current.info.artworkUrl) embed.setThumbnail(current.info.artworkUrl);
      return interaction.reply({ embeds: [embed], components: [makeMusicButtons()] });
    }

    const error = canControlPlayer(interaction, player);
    if (error) return interaction.reply({ content: error, ephemeral: true });

    if (name === 'pause') {
      await player.pause();
      return interaction.reply('⏸️ Musik dijeda.');
    }
    if (name === 'resume') {
      await player.resume();
      return interaction.reply('▶️ Musik dilanjutkan.');
    }
    if (name === 'skip') {
      await player.skip();
      return interaction.reply('⏭️ Lagu dilewati.');
    }
    if (name === 'stop') {
      await player.stopPlaying();
      player.queue.clear();
      return interaction.reply('⏹️ Musik dihentikan dan antrean dikosongkan.');
    }
    if (name === 'volume') {
      const level = interaction.options.getInteger('level', true);
      await player.setVolume(level);
      return interaction.reply(`🔊 Volume disetel ke **${level}%**.`);
    }
    if (name === 'leave') {
      await player.destroy();
      client.lavalink.deletePlayer(interaction.guildId);
      return interaction.reply('👋 Bot keluar dari voice channel.');
    }
  } catch (error) {
    console.error('Interaction error:', error);
    const message = error.message || 'Terjadi error. Coba lagi.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `❌ ${message}`, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true }).catch(() => {});
    }
  }
});

client.lavalink.on('trackStart', (player, track) => {
  console.log(`[music] Started: ${trackTitle(track)} in guild ${player.guildId}`);
});
client.lavalink.on('trackError', (player, track, payload) => {
  console.error(`[music] Track error (${trackTitle(track)}):`, payload?.exception?.message || payload);
});
client.lavalink.on('nodeError', (node, error) => {
  console.error(`[lavalink] Node error ${node?.id || ''}:`, error);
});

process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));

client.login(DISCORD_TOKEN);
