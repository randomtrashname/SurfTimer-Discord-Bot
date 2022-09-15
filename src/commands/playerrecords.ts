import { EmbedBuilder, SlashCommandBuilder } from '@discordjs/builders';
import {
    CommandInteraction,
    WebhookMessageOptions,
} from 'discord.js';
// import e from 'express';

import { prisma, steamWebApi } from '../main';
import { convertToSteam64 } from '../utils/convertToSteam64';
import { ck_playertimes } from '.prisma/client';

export default {
    data: new SlashCommandBuilder()
        .setName('playerrecords')
        .setDescription('Gets the records held by a player.')
        .addStringOption((option) =>
            option
                .setName('playerid')
                .setDescription('The steam profile URL of the player, or their Steam ID.')
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
    const playerID = interaction.options.get('playerid').value!.toString();
    const steamID64 = await convertToSteam64(playerID, process.env.STEAM_API_KEY);
    if (steamID64 === undefined) {
        return 'Incorrect playerID.';
    }
    const playerInfo = await steamWebApi.usersApi.getPlayerSummaries([steamID64]);
    if (playerInfo.response.players.length === 0) {
        return 'Incorrect playerID.';
    }

    const player = playerInfo.response.players[0];

    const x = await prisma.ck_playerrank.findFirst({
        select: {
            steamid: true
        },
        where: {
            steamid64: player.steamid
        }
    })

    if (!x || x.steamid == undefined) {
        return `${player.personaname} has no records.`;
    }

    const res1 = await prisma.$queryRaw<ck_playertimes[]>`SELECT mapname FROM ck_playertimes a WHERE runtimepro = (SELECT MIN(runtimepro) FROM ck_playertimes b WHERE a.mapname = b.mapname AND style=0) AND steamid=${x.steamid}`
    if (!res1 || res1.length == 0) {
        return `${player.personaname} has no records.`;
    }

    let maplist = res1.map((item) => item.mapname).join("\r\n")

    const embed = new EmbedBuilder()
        .setTitle(`🥇 __Records of ${playerInfo.response.players[0]['personaname']}__ 🥇`)
        .setThumbnail(player.avatarfull)
        .addFields({
            name: "Maps", value: maplist
        })

    return { embeds: [embed] };
}
