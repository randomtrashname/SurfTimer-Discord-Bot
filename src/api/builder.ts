import { BufferResolvable, AttachmentBuilder, TextChannel } from 'discord.js';
import * as express from 'express';
import { readFileSync } from 'fs';
import nodeHtmlToImage from 'node-html-to-image';

import { client, steamWebApi } from '../main';
import { MapRecordData } from '../types';

export const api = express();

api.use(express.json());

api.post('/record', async (req, res) => {
  const data = req.body as MapRecordData;
  if (data.apiKey !== process.env.API_KEY) {
    console.log('ERROR_NO_API_KEY')
    return res.sendStatus(403);
  }

  const playerInfo = await steamWebApi.usersApi.getPlayerSummaries([
    data.steamID64,
  ]);

  if (playerInfo.response.players.length === 0) {
    console.log('ERROR_EMPTY_PLAYER_INFO')
    return res.sendStatus(400);
  }

  const player = playerInfo.response.players[0];

  const channel = client.channels.cache.get(
    process.env.MAP_RECORD_CHANNEL_ID,
  ) as TextChannel;
  const text = readFileSync(
    './templates/map-record-default.html',
    'utf8',
  ).toString();

  // Adding spaces here isn't the best solution, but works for the amount of effort it deserves to get.
  const styles = ["", "Sideways ", "Half-Sideways ", "Backwards ", "Low-Gravity ", "Slow Motion ", "Fast Forward ", "Freestyle "];

  // TODO: Specify which bonus has a new record. (e.g. Surf_Lost2 [Bonus 2])
  nodeHtmlToImage({
    html: text,
    content: {
      playerName: player.personaname,
      style: styles[data.style],
      mapType: data.bonusGroup == -1 ? "map" : "bonus",
      mapName: data.mapName,
      avatar: player.avatarfull,
      newTime: data.newTime,
      timeDiff: data.timeDiff,
    },
  }).then((image) => {

    const attachment = new AttachmentBuilder(
      image as BufferResolvable);

    const content = {
      files: [attachment],
    };
    channel.send(content);
  });
  return res.sendStatus(201);
});
