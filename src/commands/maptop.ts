import { SlashCommandBuilder } from '@discordjs/builders';
import {
  CommandInteraction,
  MessageEmbed,
  WebhookMessageOptions,
} from 'discord.js';

import { prisma, MAPS_IMAGES_URL } from '../main';
import { toMMSS } from '../utils/toMMSS';

export default {
  data: new SlashCommandBuilder()
    .setName('maptop')
    .setDescription('Gets the top 10 runs on a map.')
    .addStringOption((option) =>
      option
        .setName('mapname')
        .setDescription('The name of the map')
        .setRequired(true),
    ),
  async execute(interaction: CommandInteraction) {
    await interaction.deferReply();
    try {
      const reply = await cmdCallback(interaction);
      await interaction.editReply(reply);
    } catch (err) {
      console.error(err);
      await interaction.editReply('An internal error occured.');
    }
  },
};

async function cmdCallback(
  interaction: CommandInteraction,
): Promise<WebhookMessageOptions | string> {
  const mapname = interaction.options.getString('mapname').toLowerCase();
  const res1 = await prisma.ck_playertimes.findUnique({
    where: {
      mapname: mapname,
    },
    orderBy: {
      runtimepro: 'asc',
    },
    skip: 0,
    take: 10,
    select: {
      steamid64: true,
      name: true,
      runtimepro: true,
      date: true,
    },
  });
  if (!res1) {
    return `${mapname} has no runs.`;
  }

  const playerInfo = await steamWebApi.usersApi.getPlayerSummaries([
    res1[0].steamid64,
  ]);
  const avatarfull: string =
    playerInfo.response.players.length > 0
      ? playerInfo.response.players[0]['avatarfull']
      : '';
      
  const fields = res1.map((e, i) => {
     let nb = `🪙 ${i + 1}th`;
     if (i === 0) {
      nb = '🥇 1st';
    } else if (i === 1) {
      nb = '🥈 2nd';
     } else if (i === 2) {
       nb = '🥉 3rd';
      } else if (i === 3) {
        nb = '4th';
        } else if (i === 4) {
          nb = '5th';
          } else if (i === 5) {
            nb = '6th';
            } else if (i === 6) {
              nb = '7th';
              } else if (i === 7) {
               nb = '8th';
                } else if (i === 8) {
                 nb = '9th';
                  } else if (i === 9) {
                    nb = '10th';
     }
    return {
       name: nb,
      value: `[${e.name}](http://steamcommunity.com/profiles/${e.steamid64}) **${e.points}** _pts_`,
      inline: true,
    };
  });

  const embed = new MessageEmbed()
    .setTitle(`📈 __Map Top 10__ 📈`)
    .setImage(`${MAPS_IMAGES_URL}/${mapname}.jpg`)
    .addFields([
      {
        name: 'Map',
        value: mapname,
        inline: true,
      },
      {
        name: 'Tier',
        value: tier.toString(),
        inline: true,
      }
    ],fields);

  return { embeds: [embed] };
}
