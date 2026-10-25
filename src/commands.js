const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Putar lagu dari YouTube, Spotify, atau SoundCloud')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Link lagu/playlist atau judul lagu')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Jeda musik'),
  new SlashCommandBuilder().setName('resume').setDescription('Lanjutkan musik'),
  new SlashCommandBuilder().setName('skip').setDescription('Lewati lagu saat ini'),
  new SlashCommandBuilder().setName('stop').setDescription('Hentikan musik dan kosongkan antrean'),
  new SlashCommandBuilder().setName('queue').setDescription('Lihat antrean lagu'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Lihat lagu yang sedang diputar'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Atur volume musik')
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('Volume 1 sampai 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('leave').setDescription('Keluarkan bot dari voice channel')
].map(command => command.toJSON());

module.exports = { commands };
